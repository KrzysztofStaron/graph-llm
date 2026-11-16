import type {
  Flow,
  GraphNode,
  GraphNodes,
  NodeDimensions,
  NodeType,
  Seat,
} from "../types/GraphCanvas.types";

export const CHILD_BELOW_PARENT_GAP = 35;

/** Widest a conversation node can be. ResponseNode and SummaryNode read it as their max width. */
export const LANE_WIDTH = 808;

const LANE_GUTTER = 72;
/** Center-to-center distance between sibling branches in a "below" flow. */
const LANE_PITCH = LANE_WIDTH + LANE_GUTTER;
/** A new side lane needs its column clear of other seated chains this far before and after its first node. */
const LANE_ROOM = 1200;
/** Cross-axis step and breadth of a sibling branch in a "right" | "left" flow. */
const ROW_PITCH = 200;
const SIDE_GAP = 60;
const DROP_GAP = 24;
const NEW_NODE_ID = "\u0000new";

/** What every call reads. Plain data, built by the caller from nodesRef and nodeDimensionsRef. */
export interface Canvas {
  readonly nodes: GraphNodes;
  /** Measured sizes. A node missing here is unmeasured. */
  readonly sizes: NodeDimensions;
}

/** A point in canvas coordinates. The `__space` field keeps a screen point from passing for one. */
export type CanvasPoint = {
  readonly x: number;
  readonly y: number;
  readonly __space: "canvas";
};

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export interface Spot {
  x: number;
  y: number;
}

export interface SeatedSpot extends Spot {
  seat: Seat;
}

/** Absolute position. No deltas, so a stale snapshot cannot double-apply. */
export interface Move {
  id: string;
  x: number;
  y: number;
}

/** The one screen-to-canvas conversion. `viewportPoint` is relative to the [data-viewport] element. */
export function toCanvasPoint(
  viewportPoint: { x: number; y: number },
  transform: ViewTransform
): CanvasPoint {
  return {
    x: (viewportPoint.x - transform.x) / transform.k,
    y: (viewportPoint.y - transform.y) / transform.k,
    __space: "canvas",
  };
}

/** Center of the bounding box of `ids`. Undefined when none of them exist. */
export function centerOfNodes(
  canvas: Canvas,
  ids: readonly string[]
): CanvasPoint | undefined {
  const box = boundsOf(
    ids.flatMap((id) => {
      const node = canvas.nodes[id];
      return node ? [rectOf(canvas, node)] : [];
    })
  );
  if (!box) return undefined;
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    __space: "canvas",
  };
}

/**
 * Where a new conversation node goes. It hangs off the node(s) it continues from and follows them.
 *
 * The first continuation takes the main lane under its host. A later one is a branch and takes the
 * first lane on the pointer's side whose column is clear of other seated chains, so its own chain
 * has room. A video joins the main lane stack ahead of the follow-up. The direction is inherited:
 * a host the user dragged beside its parent makes its new children flow that way.
 *
 * Never returns a continuation spot that overlaps a seated node.
 */
export function hang(
  canvas: Canvas,
  request: {
    type: NodeType;
    /** Several ids for one question asked about a multi-selection. */
    on: readonly [string, ...string[]];
    pointer?: CanvasPoint;
  }
): SeatedSpot {
  const hosts = request.on.flatMap((id) => {
    const node = canvas.nodes[id];
    return node ? [node] : [];
  });
  const host = lowest(canvas, hosts);
  const view = viewOf(canvas);
  const hostRect = rectOf(canvas, host);
  const flow = flowFor(canvas, host);
  const groupBox = boundsOf(hosts.map((node) => rectOf(canvas, node)));
  const base =
    flow === "below" && groupBox
      ? centerX(groupBox) - centerX(hostRect)
      : 0;

  const rectIn = (seat: Seat): Rect => {
    const ghost: LaneNode = {
      id: NEW_NODE_ID,
      type: request.type,
      childrenIds: [],
      seat,
    };
    const mates = (view.seatedOn.get(host.id) ?? []).filter((node) =>
      sameLane(node.seat, seat)
    );
    const lane = stackOrder([...mates, ghost]);
    return placeLane(view, host, hostRect, lane)[lane.indexOf(ghost)];
  };

  if (isAttachment(request.type)) {
    const seat: Seat = { hostId: host.id, flow, shift: base };
    const rect = rectIn(seat);
    return { x: rect.x, y: rect.y, seat };
  }

  const side = request.pointer
    ? Math.sign(
        flow === "below"
          ? request.pointer.x - (centerX(hostRect) + base)
          : request.pointer.y - (hostRect.y + hostRect.height / 2)
      ) || 1
    : 1;
  const seatedSiblings = (view.seatedOn.get(host.id) ?? []).filter(
    (node) => !isAttachment(node.type)
  );
  const handPlacedSiblings = host.childrenIds.flatMap((id) => {
    const child = canvas.nodes[id];
    return child && !isAttachment(child.type) && !isSeated(child, canvas.nodes)
      ? [rectOf(canvas, child)]
      : [];
  });

  for (let k = 0; ; k += 1) {
    const seat: Seat = {
      hostId: host.id,
      flow,
      shift: base + side * k * (flow === "below" ? LANE_PITCH : ROW_PITCH),
    };
    const rect = rectIn(seat);
    const column = columnAround(rect, flow);
    const ownedBySibling =
      seatedSiblings.some((node) => sameLane(node.seat, seat)) ||
      handPlacedSiblings.some((sibling) => touches(column, sibling, 0));
    if (ownedBySibling) continue;
    const blocked = view.seatedRects.some(
      (other) =>
        touches(rect, other, 0) || (k !== 0 && touches(column, other, 0))
    );
    if (blocked) continue;
    return { x: rect.x, y: rect.y, seat };
  }
}

/**
 * Where nodes the user pointed at go. One spot per entry of `types`, in order, with no seat:
 * these nodes are the user's from the first frame. The block is packed into rows and centered on
 * `at`, then slid the shortest distance along one axis until it overlaps nothing.
 */
export function drop(
  canvas: Canvas,
  request: { types: readonly NodeType[]; at: CanvasPoint }
): Spot[] {
  const perRow = Math.ceil(Math.sqrt(request.types.length));
  const cells: Rect[] = [];
  let cellX = 0;
  let rowY = 0;
  let rowHeight = 0;
  request.types.forEach((type, index) => {
    if (index > 0 && index % perRow === 0) {
      cellX = 0;
      rowY += rowHeight + DROP_GAP;
      rowHeight = 0;
    }
    const size = getDefaultNodeDimensions(type);
    cells.push({ x: cellX, y: rowY, ...size });
    cellX += size.width + DROP_GAP;
    rowHeight = Math.max(rowHeight, size.height);
  });
  const block = boundsOf(cells);
  if (!block) return [];
  const clear = nudgeClear(
    {
      ...block,
      x: request.at.x - block.width / 2,
      y: request.at.y - block.height / 2,
    },
    Object.values(canvas.nodes).map((node) => rectOf(canvas, node))
  );
  return cells.map((cell) => ({ x: clear.x + cell.x, y: clear.y + cell.y }));
}

/**
 * A node's size changed or it was just painted. Returns the absolute position of every seated node
 * under the changed node's host that is not already where its seat puts it.
 *
 * It decides nothing. Each position is a function of seats, measured sizes, the host it starts
 * from, and the rects of hand-placed nodes, and settle writes none of those. So a second call
 * returns [], and no two calls can disagree. A hand-placed node is never in the output.
 *
 * An unmeasured node keeps its spawn spot until its first size report, and nothing is placed after
 * it in its lane or under it. A saved canvas therefore loads without a move per report.
 */
export function settle(canvas: Canvas, changedId: string): Move[] {
  const changed = canvas.nodes[changedId];
  if (!changed) return [];
  const view = viewOf(canvas);
  const root = hostOf(changed, canvas.nodes) ?? changed;
  if (!isMeasured(canvas, root.id)) return [];
  const placed = new Map<string, Rect>();
  const pending: Array<{ host: GraphNode; rect: Rect }> = [
    { host: root, rect: rectOf(canvas, root) },
  ];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const { host, rect: hostRect } = next;
    for (const lane of lanesOf(view, host.id)) {
      const movable = measuredPrefix(
        canvas,
        isPendingReply(host)
          ? lane.filter((node) => isAttachment(node.type))
          : lane
      );
      const rects = placeLane(view, host, hostRect, movable);
      movable.forEach((node, index) => {
        if (placed.has(node.id)) return;
        placed.set(node.id, rects[index]);
        pending.push({ host: node, rect: rects[index] });
      });
    }
  }
  return [...placed].flatMap(([id, rect]) => {
    const node = canvas.nodes[id];
    return node.x === rect.x && node.y === rect.y
      ? []
      : [{ id, x: rect.x, y: rect.y }];
  });
}

/**
 * The whole meaning of a pointer drag for layout. Every dragged node moves by (dx, dy), and so does
 * everything seated on it, transitively. A dragged node loses its seat unless its host moves in the
 * same gesture, so settle never moves it again and new children hang off where the user put it.
 */
export function dragNodes(
  nodes: GraphNodes,
  ids: readonly string[],
  dx: number,
  dy: number
): GraphNodes {
  const dragged = new Set(ids.filter((id) => nodes[id]));
  if (dragged.size === 0) return nodes;
  const moving = new Set(dragged);
  const stack = [...dragged];
  for (let hostId = stack.pop(); hostId !== undefined; hostId = stack.pop()) {
    for (const childId of nodes[hostId].childrenIds) {
      const child = nodes[childId];
      if (!child || moving.has(childId)) continue;
      if (hostOf(child, nodes)?.id !== hostId) continue;
      moving.add(childId);
      stack.push(childId);
    }
  }
  const next: GraphNodes = { ...nodes };
  for (const id of moving) {
    const node = nodes[id];
    const host = hostOf(node, nodes);
    next[id] = {
      ...node,
      x: node.x + dx,
      y: node.y + dy,
      seat: host && moving.has(host.id) ? node.seat : undefined,
    };
  }
  return next;
}

export function getDefaultNodeDimensions(nodeType: GraphNode["type"]): {
  width: number;
  height: number;
} {
  switch (nodeType) {
    case "context":
      return { width: 176, height: 96 };
    case "image-context":
      return { width: 464, height: 384 };
    case "image-response":
      return { width: 520, height: 520 };
    case "document":
      return { width: 176, height: 96 };
    case "input":
      return { width: 400, height: 120 };
    case "response":
      return { width: 400, height: 80 };
    case "summary":
      return { width: 520, height: 180 };
    case "youtube":
      return { width: 640, height: 400 };
    default: {
      const _exhaustive: never = nodeType;
      return _exhaustive;
    }
  }
}

export function hasRenderableContent(node: GraphNode): boolean {
  return node.value.trim().length > 0;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SeatedNode = GraphNode & { seat: Seat };

/** What placeLane reads from a lane member. A node about to be created has no record yet. */
interface LaneNode {
  readonly id: string;
  readonly type: NodeType;
  readonly childrenIds: readonly string[];
  readonly seat: Seat;
}

/** Built once per public call so each lookup below is answered without another pass over nodes. */
interface View {
  readonly canvas: Canvas;
  /** Host id to the nodes seated on it, in creation order. */
  readonly seatedOn: ReadonlyMap<string, readonly SeatedNode[]>;
  /** Seated nodes at their current spot, measured size or the default for their type. */
  readonly seatedRects: readonly Rect[];
  /** Measured hand-placed nodes. The only obstacles placeLane hops. */
  readonly handPlaced: ReadonlyArray<{ readonly id: string; readonly rect: Rect }>;
}

function viewOf(canvas: Canvas): View {
  const seatedOn = new Map<string, SeatedNode[]>();
  const seatedRects: Rect[] = [];
  const handPlaced: Array<{ id: string; rect: Rect }> = [];
  for (const node of Object.values(canvas.nodes)) {
    if (isSeated(node, canvas.nodes)) {
      const mates = seatedOn.get(node.seat.hostId);
      if (mates) mates.push(node);
      else seatedOn.set(node.seat.hostId, [node]);
      seatedRects.push(rectOf(canvas, node));
    } else if (isMeasured(canvas, node.id)) {
      handPlaced.push({ id: node.id, rect: rectOf(canvas, node) });
    }
  }
  return { canvas, seatedOn, seatedRects, handPlaced };
}

function isSeated(node: GraphNode, nodes: GraphNodes): node is SeatedNode {
  return (
    node.seat !== undefined &&
    nodes[node.seat.hostId] !== undefined &&
    node.parentIds.includes(node.seat.hostId)
  );
}

function hostOf(node: GraphNode, nodes: GraphNodes): GraphNode | undefined {
  return isSeated(node, nodes) ? nodes[node.seat.hostId] : undefined;
}

function isMeasured(canvas: Canvas, id: string): boolean {
  return canvas.sizes[id] !== undefined;
}

/** Measured size, else the default for the type. */
function rectOf(
  canvas: Canvas,
  node: { id: string; type: NodeType; x: number; y: number }
): Rect {
  const size = canvas.sizes[node.id] ?? getDefaultNodeDimensions(node.type);
  return { x: node.x, y: node.y, width: size.width, height: size.height };
}

/** Video results stack directly under their reply, ahead of the follow-up. The one type rule here. */
function isAttachment(type: NodeType): boolean {
  return type === "youtube";
}

function isPendingReply(node: GraphNode): boolean {
  return (
    (node.type === "response" || node.type === "image-response") &&
    !hasRenderableContent(node)
  );
}

function sameLane(a: Seat, b: Seat): boolean {
  return a.flow === b.flow && a.shift === b.shift;
}

function stackOrder<T extends { type: NodeType }>(lane: readonly T[]): T[] {
  return [
    ...lane.filter((node) => isAttachment(node.type)),
    ...lane.filter((node) => !isAttachment(node.type)),
  ];
}

/** Nodes seated on `hostId`, grouped by lane. A lane with several nodes is a stack: videos, then the follow-up. */
function lanesOf(view: View, hostId: string): SeatedNode[][] {
  const lanes = new Map<string, SeatedNode[]>();
  for (const node of view.seatedOn.get(hostId) ?? []) {
    const key = `${node.seat.flow} ${node.seat.shift}`;
    const lane = lanes.get(key);
    if (lane) lane.push(node);
    else lanes.set(key, [node]);
  }
  return [...lanes.values()].map(stackOrder);
}

function measuredPrefix<T extends { id: string }>(
  canvas: Canvas,
  lane: readonly T[]
): T[] {
  const firstUnmeasured = lane.findIndex((node) => !isMeasured(canvas, node.id));
  return firstUnmeasured === -1 ? [...lane] : lane.slice(0, firstUnmeasured);
}

/**
 * The single place geometry is computed. `hang` and `settle` both end here.
 * Each node sits after the previous one (or the host) along the flow, at its seat's offset across
 * it, then hops past any measured hand-placed node it touches. The cross-axis coordinate never
 * changes, and the hop only moves forward along the flow, so it ends.
 */
function placeLane(
  view: View,
  host: GraphNode,
  hostRect: Rect,
  lane: readonly LaneNode[]
): Rect[] {
  const rects: Rect[] = [];
  let previous: Rect | undefined;
  for (const node of lane) {
    const size =
      view.canvas.sizes[node.id] ?? getDefaultNodeDimensions(node.type);
    const blockers = view.handPlaced.flatMap((other) =>
      other.id === host.id || node.childrenIds.includes(other.id)
        ? []
        : [other.rect]
    );
    const rect = hopPast(
      slotAfter(hostRect, previous, node.seat, size),
      node.seat.flow,
      blockers
    );
    rects.push(rect);
    previous = rect;
  }
  return rects;
}

function slotAfter(
  hostRect: Rect,
  previous: Rect | undefined,
  seat: Seat,
  size: { width: number; height: number }
): Rect {
  const before = previous ?? hostRect;
  switch (seat.flow) {
    case "below":
      return {
        x: centerX(hostRect) + seat.shift - size.width / 2,
        y: before.y + before.height + CHILD_BELOW_PARENT_GAP,
        ...size,
      };
    case "right":
      return {
        x: before.x + before.width + SIDE_GAP,
        y: hostRect.y + seat.shift,
        ...size,
      };
    case "left":
      return {
        x: before.x - SIDE_GAP - size.width,
        y: hostRect.y + seat.shift,
        ...size,
      };
  }
}

function hopPast(rect: Rect, flow: Flow, blockers: readonly Rect[]): Rect {
  const gap = flow === "below" ? CHILD_BELOW_PARENT_GAP : SIDE_GAP;
  let out = rect;
  for (let hops = 0; hops <= blockers.length; hops += 1) {
    const blocker = blockers.find((other) => touches(out, other, gap));
    if (!blocker) return out;
    out =
      flow === "below"
        ? { ...out, y: blocker.y + blocker.height + gap }
        : flow === "right"
          ? { ...out, x: blocker.x + blocker.width + gap }
          : { ...out, x: blocker.x - gap - out.width };
  }
  return out;
}

/**
 * The direction nodes created under `host` flow in. A seated host keeps its chain's direction.
 * A hand-placed host flows the way the user put it relative to its conversation parent.
 */
function flowFor(canvas: Canvas, host: GraphNode): Flow {
  if (isSeated(host, canvas.nodes)) return host.seat.flow;
  const parentId =
    host.parentIds.find((id) => isConversation(canvas.nodes[id]?.type)) ??
    host.parentIds[0];
  const parent = parentId ? canvas.nodes[parentId] : undefined;
  if (!parent || !isMeasured(canvas, parent.id)) return "below";
  const from = rectOf(canvas, parent);
  const at = rectOf(canvas, host);
  if (at.y >= from.y + from.height || touches(at, from, 0)) return "below";
  if (at.x >= from.x + from.width) return "right";
  if (at.x + at.width <= from.x) return "left";
  return "below";
}

function isConversation(type: NodeType | undefined): boolean {
  return type === "input" || type === "response" || type === "image-response";
}

/** The host whose bottom edge is lowest, so a multi-parent question sits under all of them. */
function lowest(canvas: Canvas, hosts: readonly GraphNode[]): GraphNode {
  const [first, ...rest] = hosts;
  if (!first) throw new Error("hang: none of the hosts exist");
  const bottom = (node: GraphNode) => {
    const rect = rectOf(canvas, node);
    return rect.y + rect.height;
  };
  return rest.reduce((low, node) => (bottom(node) > bottom(low) ? node : low), first);
}

/** The room a new branch needs: a lane-wide band through `rect`, reaching LANE_ROOM both ways along the flow. */
function columnAround(rect: Rect, flow: Flow): Rect {
  return flow === "below"
    ? {
        x: centerX(rect) - LANE_WIDTH / 2,
        y: rect.y - LANE_ROOM,
        width: LANE_WIDTH,
        height: 2 * LANE_ROOM,
      }
    : {
        x: rect.x - LANE_ROOM,
        y: rect.y,
        width: 2 * LANE_ROOM,
        height: ROW_PITCH,
      };
}

type Direction = "down" | "right" | "up" | "left";
const DIRECTIONS: readonly Direction[] = ["down", "right", "up", "left"];

/** Push monotonically past every obstacle in each axis direction, keep the shortest slide. */
function nudgeClear(block: Rect, obstacles: readonly Rect[]): Rect {
  const slides = DIRECTIONS.map((direction) =>
    slideClear(block, obstacles, direction)
  );
  const distance = (rect: Rect) =>
    Math.abs(rect.x - block.x) + Math.abs(rect.y - block.y);
  return slides.reduce((best, rect) =>
    distance(rect) < distance(best) ? rect : best
  );
}

function slideClear(
  block: Rect,
  obstacles: readonly Rect[],
  direction: Direction
): Rect {
  let out = block;
  for (let pushes = 0; pushes <= obstacles.length; pushes += 1) {
    const hit = obstacles.find((other) => touches(out, other, DROP_GAP));
    if (!hit) return out;
    out =
      direction === "down"
        ? { ...out, y: hit.y + hit.height + DROP_GAP }
        : direction === "up"
          ? { ...out, y: hit.y - DROP_GAP - out.height }
          : direction === "right"
            ? { ...out, x: hit.x + hit.width + DROP_GAP }
            : { ...out, x: hit.x - DROP_GAP - out.width };
  }
  return out;
}

/** Written with `<` so a NaN coordinate reads as clear instead of blocking every candidate. */
function touches(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

function boundsOf(rects: readonly Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function centerX(rect: Rect): number {
  return rect.x + rect.width / 2;
}
