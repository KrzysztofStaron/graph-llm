import type { GraphNode, GraphNodes, NodeDimensions } from "../types/";
import { LAYOUT_CONFIG } from "../globals";
import logger from "./logger";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutConfig {
  gapPx: number;
  gridStepPx: number;
  maxSearchRings: number;
}

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  gapPx: LAYOUT_CONFIG.gapPx,
  gridStepPx: LAYOUT_CONFIG.gridStepPx,
  maxSearchRings: LAYOUT_CONFIG.maxSearchRings,
};

/**
 * Get default dimensions for a node type
 */
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
  }
}

/**
 * Get the rectangle (AABB) for a node
 */
export function getNodeRect(
  node: GraphNode,
  dimensions: NodeDimensions
): Rectangle | undefined {
  const dim = dimensions[node.id];
  if (!dim) {
    return undefined;
  }
  return {
    x: node.x,
    y: node.y,
    width: dim.width,
    height: dim.height,
  };
}

/**
 * Check if two rectangles intersect (with optional gap)
 */
export function rectanglesIntersect(
  a: Rectangle,
  b: Rectangle,
  gap: number = 0
): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

/**
 * Find a free position near a target point using spiral search
 *
 * @param targetX - Desired X position
 * @param targetY - Desired Y position
 * @param newNodeWidth - Width of the node to place
 * @param newNodeHeight - Height of the node to place
 * @param existingNodes - All existing nodes
 * @param dimensions - Measured dimensions of existing nodes
 * @param preferredDirection - Direction to prefer (e.g., "below" for vertical flow)
 * @param config - Layout configuration
 * @returns Free position {x, y}
 */
export function findFreePosition(
  targetX: number,
  targetY: number,
  newNodeWidth: number,
  newNodeHeight: number,
  existingNodes: GraphNodes,
  dimensions: NodeDimensions,
  preferredDirection: "below" | "right" | "left" | "above" = "below",
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): { x: number; y: number } {
  const { gapPx, gridStepPx, maxSearchRings } = config;

  // Build list of existing rectangles
  const existingRects = Object.values(existingNodes).map((node) => {
    return (
      getNodeRect(node, dimensions) ?? {
        x: node.x,
        y: node.y,
        width: 1,
        height: 1,
      }
    );
  });

  // Helper to check if a position is free
  const isPositionFree = (x: number, y: number): boolean => {
    const candidateRect: Rectangle = {
      x,
      y,
      width: newNodeWidth,
      height: newNodeHeight,
    };

    for (const existingRect of existingRects) {
      if (rectanglesIntersect(candidateRect, existingRect, gapPx)) {
        return false;
      }
    }
    return true;
  };

  // First, try the exact target position
  if (isPositionFree(targetX, targetY)) {
    return { x: targetX, y: targetY };
  }

  // Define search offsets based on preferred direction
  // We'll search in a spiral pattern but STRONGLY bias towards the preferred direction
  const getSearchOffsets = (
    ring: number
  ): Array<{ dx: number; dy: number }> => {
    const offsets: Array<{ dx: number; dy: number }> = [];
    const step = gridStepPx * ring;

    // Generate positions in a ring around the target
    // STRONGLY prioritize the preferred direction - only check that direction for early rings
    const strongBiasRings = 10; // Only check preferred direction for first 10 rings

    switch (preferredDirection) {
      case "below":
        // Search below first
        for (let dx = -ring; dx <= ring; dx++) {
          offsets.push({ dx: dx * gridStepPx, dy: step }); // below
        }
        // Only add other directions after initial rings
        if (ring > strongBiasRings) {
          for (let dy = -ring; dy < ring; dy++) {
            offsets.push({ dx: step, dy: dy * gridStepPx }); // right
            offsets.push({ dx: -step, dy: dy * gridStepPx }); // left
          }
          for (let dx = -ring; dx <= ring; dx++) {
            offsets.push({ dx: dx * gridStepPx, dy: -step }); // above
          }
        }
        break;

      case "right":
        // Search right first
        for (let dy = -ring; dy <= ring; dy++) {
          offsets.push({ dx: step, dy: dy * gridStepPx });
        }
        if (ring > strongBiasRings) {
          for (let dx = -ring; dx < ring; dx++) {
            offsets.push({ dx: dx * gridStepPx, dy: step });
            offsets.push({ dx: dx * gridStepPx, dy: -step });
          }
          for (let dy = -ring; dy <= ring; dy++) {
            offsets.push({ dx: -step, dy: dy * gridStepPx });
          }
        }
        break;

      case "left":
        // Search left first - STRONGLY prefer left
        for (let dy = -ring; dy <= ring; dy++) {
          offsets.push({ dx: -step, dy: dy * gridStepPx });
        }
        // Only check other directions after exhausting left
        if (ring > strongBiasRings) {
          for (let dx = -ring + 1; dx <= ring; dx++) {
            offsets.push({ dx: dx * gridStepPx, dy: step });
            offsets.push({ dx: dx * gridStepPx, dy: -step });
          }
          for (let dy = -ring; dy <= ring; dy++) {
            offsets.push({ dx: step, dy: dy * gridStepPx });
          }
        }
        break;

      case "above":
        // Search above first
        for (let dx = -ring; dx <= ring; dx++) {
          offsets.push({ dx: dx * gridStepPx, dy: -step });
        }
        if (ring > strongBiasRings) {
          for (let dy = -ring + 1; dy <= ring; dy++) {
            offsets.push({ dx: step, dy: dy * gridStepPx });
            offsets.push({ dx: -step, dy: dy * gridStepPx });
          }
          for (let dx = -ring; dx <= ring; dx++) {
            offsets.push({ dx: dx * gridStepPx, dy: step });
          }
        }
        break;
    }

    return offsets;
  };

  // Spiral search outward from target
  for (let ring = 1; ring <= maxSearchRings; ring++) {
    const offsets = getSearchOffsets(ring);

    for (const { dx, dy } of offsets) {
      const candidateX = targetX + dx;
      const candidateY = targetY + dy;

      if (isPositionFree(candidateX, candidateY)) {
        return { x: candidateX, y: candidateY };
      }
    }
  }

  // Fallback: if we couldn't find a free spot, return the target position
  // (this shouldn't happen with reasonable maxSearchRings, but better than crashing)
  logger.warn(
    "findFreePosition: Could not find free spot after max search rings, using target position"
  );
  return { x: targetX, y: targetY };
}

export const CHILD_BELOW_PARENT_GAP = 35;

export const PLACE_FORCE_CONFIG: LayoutConfig = {
  ...DEFAULT_LAYOUT_CONFIG,
  gapPx: CHILD_BELOW_PARENT_GAP,
};

export function centeredBelowParent(args: {
  parentX: number;
  parentY: number;
  parentWidth: number;
  parentHeight: number;
  childWidth: number;
}): { x: number; y: number } {
  return {
    x: args.parentX + args.parentWidth / 2 - args.childWidth / 2,
    y: args.parentY + args.parentHeight + CHILD_BELOW_PARENT_GAP,
  };
}

export function parkBelowParent(args: {
  parentX: number;
  parentY: number;
  parentHeight: number;
  parentWidth?: number;
  childWidth?: number;
}): { x: number; y: number } {
  return centeredBelowParent({
    parentX: args.parentX,
    parentY: args.parentY,
    parentWidth: args.parentWidth ?? 0,
    parentHeight: args.parentHeight,
    childWidth: args.childWidth ?? 1,
  });
}

export function centerUnderParentDx(args: {
  parentX: number;
  parentWidth: number;
  childX: number;
  childWidth: number;
}): number {
  return args.parentX + args.parentWidth / 2 - args.childWidth / 2 - args.childX;
}

export function hasRenderableContent(node: GraphNode): boolean {
  return node.value.trim().length > 0;
}

function omitNodes(nodes: GraphNodes, ignore: ReadonlySet<string>): GraphNodes {
  const next: GraphNodes = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (!ignore.has(id)) {
      next[id] = node;
    }
  }
  return next;
}

function withPositions(
  nodes: GraphNodes,
  pos: Record<string, { x: number; y: number }>
): GraphNodes {
  const next: GraphNodes = {};
  for (const node of Object.values(nodes)) {
    const placed = pos[node.id];
    next[node.id] = placed ? { ...node, x: placed.x, y: placed.y } : node;
  }
  return next;
}

export function placeCenteredBelowOrForce(args: {
  parentX: number;
  parentY: number;
  parentWidth: number;
  parentHeight: number;
  childWidth: number;
  childHeight: number;
  nodes: GraphNodes;
  dimensions: NodeDimensions;
  ignoreIds?: readonly string[];
}): { x: number; y: number } {
  const desired = centeredBelowParent(args);
  const obstacles = Object.values(
    omitNodes(args.nodes, new Set(args.ignoreIds ?? []))
  ).flatMap((node) => {
    const rect = getNodeRect(node, args.dimensions);
    return rect ? [rect] : [];
  });
  const fits = (x: number, y: number) => {
    const candidate = {
      x,
      y,
      width: args.childWidth,
      height: args.childHeight,
    };
    return obstacles.every(
      (rect) => !rectanglesIntersect(candidate, rect, PLACE_FORCE_CONFIG.gapPx)
    );
  };
  if (fits(desired.x, desired.y)) {
    return desired;
  }
  const { gridStepPx, maxSearchRings } = PLACE_FORCE_CONFIG;
  for (let ring = 1; ring <= maxSearchRings; ring++) {
    const y = desired.y + gridStepPx * ring;
    if (fits(desired.x, y)) {
      return { x: desired.x, y };
    }
  }
  return desired;
}

function layoutParentOf(
  node: GraphNode,
  nodes: GraphNodes
): GraphNode | undefined {
  if (
    node.type === "response" ||
    node.type === "image-response" ||
    node.type === "image-context"
  ) {
    const parentId =
      node.parentIds.find((id) => nodes[id]?.type === "input") ?? node.parentIds[0];
    return parentId ? nodes[parentId] : undefined;
  }
  if (node.type === "input") {
    const parentId = node.parentIds.find((id) => {
      const parent = nodes[id];
      return parent?.type === "response" || parent?.type === "image-response";
    });
    return parentId ? nodes[parentId] : undefined;
  }
  if (node.type === "youtube") {
    const parentId = node.parentIds[0];
    return parentId ? nodes[parentId] : undefined;
  }
  return undefined;
}

function stackHeightBelowParent(args: {
  parent: GraphNode;
  parentHeight: number;
  nodes: GraphNodes;
  dimensions: NodeDimensions;
  pos: Record<string, { x: number; y: number }>;
}): number {
  let height = args.parentHeight;
  const parentPos = args.pos[args.parent.id];
  if (!parentPos) {
    return height;
  }
  for (const id of args.parent.childrenIds) {
    const sibling = args.nodes[id];
    const dim = args.dimensions[id];
    const siblingPos = args.pos[id];
    if (!sibling || sibling.type !== "youtube" || !dim || !siblingPos) {
      continue;
    }
    height = Math.max(height, siblingPos.y + dim.height - parentPos.y);
  }
  return height;
}

function placeNodeUnderParent(args: {
  node: GraphNode;
  width: number;
  height: number;
  nodes: GraphNodes;
  dimensions: NodeDimensions;
  pos: Record<string, { x: number; y: number }>;
}) {
  if (args.node.pinned) {
    return;
  }
  const parent = layoutParentOf(args.node, args.nodes);
  const parentPos = parent ? args.pos[parent.id] : undefined;
  const parentDim = parent ? args.dimensions[parent.id] : undefined;
  if (!parent || !parentPos || !parentDim) {
    return;
  }
  const parentHeight =
    args.node.type === "input"
      ? stackHeightBelowParent({
          parent,
          parentHeight: parentDim.height,
          nodes: args.nodes,
          dimensions: args.dimensions,
          pos: args.pos,
        })
      : parentDim.height;
  const placed = placeCenteredBelowOrForce({
    parentX: parentPos.x,
    parentY: parentPos.y,
    parentWidth: parentDim.width,
    parentHeight,
    childWidth: args.width,
    childHeight: args.height,
    nodes: withPositions(args.nodes, args.pos),
    dimensions: args.dimensions,
    ignoreIds: [args.node.id, ...args.node.childrenIds],
  });
  args.pos[args.node.id] = placed;
}

function netMoves(
  nodes: GraphNodes,
  pos: Record<string, { x: number; y: number }>
): Array<{ nodeId: string; dx: number; dy: number }> {
  const moves: Array<{ nodeId: string; dx: number; dy: number }> = [];
  for (const node of Object.values(nodes)) {
    const next = pos[node.id];
    if (!next) {
      continue;
    }
    const dx = next.x - node.x;
    const dy = next.y - node.y;
    if (dx !== 0 || dy !== 0) {
      moves.push({ nodeId: node.id, dx, dy });
    }
  }
  return moves;
}

export function layoutMovesForMeasuredNode(args: {
  node: GraphNode;
  width: number;
  height: number;
  nodes: GraphNodes;
  dimensions: NodeDimensions;
}): Array<{ nodeId: string; dx: number; dy: number }> {
  const { node, width, height, nodes } = args;
  const dimensions = {
    ...args.dimensions,
    [node.id]: { width, height },
  };
  const pos: Record<string, { x: number; y: number }> = {};
  for (const current of Object.values(nodes)) {
    pos[current.id] = { x: current.x, y: current.y };
  }

  placeNodeUnderParent({ node, width, height, nodes, dimensions, pos });

  const isContentReply =
    (node.type === "response" || node.type === "image-response") &&
    hasRenderableContent(node);
  if (isContentReply) {
    for (const childId of node.childrenIds) {
      const child = nodes[childId];
      const childDim = dimensions[childId];
      if (!child || child.type !== "input" || !childDim) {
        continue;
      }
      placeNodeUnderParent({
        node: child,
        width: childDim.width,
        height: childDim.height,
        nodes,
        dimensions,
        pos,
      });
    }
  }

  if (node.type === "youtube") {
    const parent = layoutParentOf(node, nodes);
    if (parent) {
      for (const childId of parent.childrenIds) {
        const child = nodes[childId];
        const childDim = dimensions[childId];
        if (!child || child.type !== "input" || !childDim) {
          continue;
        }
        placeNodeUnderParent({
          node: child,
          width: childDim.width,
          height: childDim.height,
          nodes,
          dimensions,
          pos,
        });
      }
    }
  }

  return netMoves(nodes, pos);
}
