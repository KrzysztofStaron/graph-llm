import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHILD_BELOW_PARENT_GAP,
  MAX_NODE_WIDTH,
  centerOfNodes,
  dragNodes,
  drop,
  getDefaultNodeDimensions,
  hang,
  hasRenderableContent,
  settle,
  toCanvasPoint,
  type CanvasPoint,
  type SeatedSpot,
} from "./placement";
import type {
  GraphNode,
  GraphNodes,
  NodeDimensions,
  NodeType,
  Seat,
} from "../types/GraphCanvas.types";

type World = { nodes: GraphNodes; sizes: NodeDimensions };
type Size = { width: number; height: number };
type Box = { x: number; y: number; width: number; height: number };

const point = (x: number, y: number): CanvasPoint =>
  toCanvasPoint({ x, y }, { x: 0, y: 0, k: 1 });

function emptyWorld(): World {
  return { nodes: {}, sizes: {} };
}

function makeNode(
  id: string,
  type: NodeType,
  x: number,
  y: number,
  value: string,
  parentIds: string[] = [],
  seat?: Seat
): GraphNode {
  return { id, type, x, y, value, parentIds, childrenIds: [], seat };
}

function placeByHand(
  world: World,
  id: string,
  type: NodeType,
  x: number,
  y: number,
  size: Size = getDefaultNodeDimensions(type)
) {
  world.nodes[id] = makeNode(id, type, x, y, "text");
  report(world, id, size);
}

function add(
  world: World,
  id: string,
  type: NodeType,
  spot: SeatedSpot,
  on: readonly string[],
  value: string
) {
  world.nodes[id] = makeNode(id, type, spot.x, spot.y, value, [...on], spot.seat);
  for (const parentId of on) {
    const parent = world.nodes[parentId];
    world.nodes[parentId] = { ...parent, childrenIds: [...parent.childrenIds, id] };
  }
}

function spawn(
  world: World,
  id: string,
  type: NodeType,
  on: [string, ...string[]],
  options: { pointer?: CanvasPoint; value?: string; size?: Size } = {}
): SeatedSpot {
  const spot = hang(world, { type, on, pointer: options.pointer });
  add(world, id, type, spot, on, options.value ?? "text");
  if (options.size) report(world, id, options.size);
  return spot;
}

function report(world: World, id: string, size: Size) {
  world.sizes[id] = size;
  for (const move of settle(world, id)) {
    world.nodes[move.id] = { ...world.nodes[move.id], x: move.x, y: move.y };
  }
}

function setValue(world: World, id: string, value: string) {
  world.nodes[id] = { ...world.nodes[id], value };
}

function boxOf(world: World, id: string): Box {
  const node = world.nodes[id];
  const size = world.sizes[id] ?? getDefaultNodeDimensions(node.type);
  return { x: node.x, y: node.y, ...size };
}

function centerX(world: World, id: string): number {
  const box = boxOf(world, id);
  return box.x + box.width / 2;
}

function bottom(world: World, id: string): number {
  const box = boxOf(world, id);
  return box.y + box.height;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function overlappingPairs(world: World): string[] {
  const ids = Object.keys(world.nodes);
  return ids.flatMap((a, i) =>
    ids
      .slice(i + 1)
      .filter((b) => overlaps(boxOf(world, a), boxOf(world, b)))
      .map((b) => `${a}x${b}`)
  );
}

function position(world: World, id: string) {
  return { x: world.nodes[id].x, y: world.nodes[id].y };
}

function chatWithFollowUp(): World {
  const world = emptyWorld();
  placeByHand(world, "q1", "input", -200, 0);
  spawn(world, "a1", "response", ["q1"], { size: { width: 808, height: 300 } });
  spawn(world, "q2", "input", ["a1"], { value: "", size: { width: 400, height: 120 } });
  return world;
}

describe("hang and settle", () => {
  it("centers a reply under its prompt while it loads and as its width changes", () => {
    const world = emptyWorld();
    placeByHand(world, "input-1", "input", 0, 0, { width: 400, height: 62 });
    spawn(world, "resp-1", "response", ["input-1"], { value: "" });

    report(world, "resp-1", { width: 220, height: 62 });
    assert.equal(world.nodes["resp-1"].x, 90);
    report(world, "resp-1", { width: 180, height: 62 });
    assert.equal(centerX(world, "resp-1"), 200);
    setValue(world, "resp-1", "hello there");
    report(world, "resp-1", { width: 520, height: 200 });
    assert.equal(centerX(world, "resp-1"), 200);
    assert.equal(world.nodes["resp-1"].y, 62 + CHILD_BELOW_PARENT_GAP);
  });

  it("slides a 1px-spawned image left so its center matches the prompt", () => {
    const world = emptyWorld();
    placeByHand(world, "input-1", "input", -200, 0);
    spawn(world, "img-1", "image-response", ["input-1"], {
      value: "https://example.com/cat.png",
      size: { width: 1, height: 1 },
    });
    report(world, "img-1", { width: 606, height: 400 });
    assert.equal(world.nodes["img-1"].x, -303);
  });

  it("recenters a loaded image under the prompt and parks the follow-up under it", () => {
    const world = emptyWorld();
    placeByHand(world, "input-1", "input", 0, 0);
    spawn(world, "img-1", "image-response", ["input-1"], {
      value: "https://example.com/cat.png",
      size: { width: 200, height: 80 },
    });
    spawn(world, "input-2", "input", ["img-1"], {
      value: "",
      size: { width: 400, height: 138 },
    });

    report(world, "img-1", { width: 606, height: 400 });

    assert.equal(centerX(world, "img-1"), 200);
    assert.equal(centerX(world, "input-2"), 200);
    assert.equal(
      world.nodes["input-2"].y,
      world.nodes["img-1"].y + 400 + CHILD_BELOW_PARENT_GAP
    );
  });

  it("does not snap a follow-up under a response that is still generating", () => {
    const world = chatWithFollowUp();
    const before = position(world, "q2");

    setValue(world, "a1", "");
    report(world, "a1", { width: 180, height: 60 });

    assert.deepEqual(position(world, "q2"), before);
    assert.equal(centerX(world, "a1"), 0);

    setValue(world, "a1", "new answer");
    report(world, "a1", { width: 808, height: 500 });
    assert.equal(world.nodes.q2.y, bottom(world, "a1") + CHILD_BELOW_PARENT_GAP);
  });

  it("hops a hand-placed node in the slot and keeps the center", () => {
    const world = emptyWorld();
    placeByHand(world, "q1", "input", 0, 0);
    placeByHand(world, "block", "context", 90, 120 + CHILD_BELOW_PARENT_GAP, {
      width: 220,
      height: 80,
    });

    spawn(world, "a1", "response", ["q1"], { size: { width: 220, height: 80 } });

    assert.equal(centerX(world, "a1"), 200);
    assert.ok(world.nodes.a1.y >= bottom(world, "block") + CHILD_BELOW_PARENT_GAP);
    assert.deepEqual(position(world, "block"), { x: 90, y: 155 });
  });

  it("puts a second and third question on one reply in separate lanes on the pointer's side", () => {
    const world = chatWithFollowUp();
    const right = point(300, 200);
    const left = point(-300, 200);

    spawn(world, "q2b", "input", ["a1"], { pointer: right, value: "", size: { width: 400, height: 120 } });
    spawn(world, "q2c", "input", ["a1"], { pointer: right, value: "", size: { width: 400, height: 120 } });
    spawn(world, "q2d", "input", ["a1"], { pointer: left, value: "", size: { width: 400, height: 120 } });

    const centers = ["q2", "q2b", "q2c", "q2d"].map((id) => centerX(world, id));
    assert.ok(centers[1] - centers[0] >= MAX_NODE_WIDTH, "first branch is right of the main lane");
    assert.ok(centers[2] - centers[1] >= MAX_NODE_WIDTH, "second branch is right of the first");
    assert.ok(centers[0] - centers[3] >= MAX_NODE_WIDTH, "a left click branches left");
    for (const id of ["q2b", "q2c", "q2d"]) {
      assert.equal(world.nodes[id].y, world.nodes.q2.y, `${id} starts level with the follow-up`);
    }

    setValue(world, "q2", "first");
    setValue(world, "q2b", "second");
    setValue(world, "q2c", "third");
    spawn(world, "a2", "response", ["q2"], { size: { width: 808, height: 900 } });
    spawn(world, "a2b", "response", ["q2b"], { size: { width: 808, height: 700 } });
    spawn(world, "a2c", "response", ["q2c"], { size: { width: 640, height: 500 } });
    spawn(world, "q3", "input", ["a2"], { value: "", size: { width: 400, height: 120 } });
    assert.deepEqual(overlappingPairs(world), []);
  });

  it("gives a nested branch a column no other chain uses", () => {
    const world = chatWithFollowUp();
    spawn(world, "q2b", "input", ["a1"], { pointer: point(300, 0), size: { width: 400, height: 120 } });
    spawn(world, "q2c", "input", ["a1"], { pointer: point(300, 0), size: { width: 400, height: 120 } });
    spawn(world, "a2b", "response", ["q2b"], { size: { width: 808, height: 700 } });
    spawn(world, "a2c", "response", ["q2c"], { size: { width: 640, height: 500 } });

    spawn(world, "q3b", "input", ["a2b"], { value: "", size: { width: 400, height: 120 } });
    spawn(world, "q3b2", "input", ["a2b"], { pointer: point(2000, 0), value: "", size: { width: 400, height: 120 } });

    const nested = centerX(world, "q3b2");
    for (const other of ["q2", "q2b", "q2c"]) {
      assert.ok(
        Math.abs(nested - centerX(world, other)) >= MAX_NODE_WIDTH,
        `nested branch keeps clear of ${other}'s column`
      );
    }
    assert.deepEqual(overlappingPairs(world), []);
  });

  it("returns no moves for a graph that is already settled", () => {
    const world = chatWithFollowUp();
    spawn(world, "q2b", "input", ["a1"], { pointer: point(300, 0), size: { width: 400, height: 120 } });
    spawn(world, "a2b", "response", ["q2b"], { size: { width: 808, height: 700 } });
    spawn(world, "y1", "youtube", ["a1"], { size: { width: 640, height: 400 } });

    for (const id of [...Object.keys(world.nodes), ...Object.keys(world.nodes).reverse()]) {
      assert.deepEqual(settle(world, id), [], `settle(${id})`);
    }
  });

  it("carries the whole subtree when a mid-chain reply grows", () => {
    const world = chatWithFollowUp();
    setValue(world, "q2", "more");
    spawn(world, "a2", "response", ["q2"], { size: { width: 400, height: 200 } });
    spawn(world, "q3", "input", ["a2"], { value: "", size: { width: 400, height: 120 } });
    const before = ["q2", "a2", "q3"].map((id) => position(world, id));

    report(world, "a1", { width: 808, height: 700 });

    const after = ["q2", "a2", "q3"].map((id) => position(world, id));
    after.forEach((spot, i) => assert.deepEqual(spot, { x: before[i].x, y: before[i].y + 400 }));
    assert.deepEqual(overlappingPairs(world), []);
  });

  it("keeps a dragged reply where the user put it", () => {
    const world = emptyWorld();
    placeByHand(world, "q1", "input", -200, 0);
    spawn(world, "a1", "response", ["q1"], { size: { width: 600, height: 300 } });
    spawn(world, "q2", "input", ["a1"], { value: "", size: { width: 400, height: 120 } });

    world.nodes = dragNodes(world.nodes, ["a1"], 700, -115);
    const dragged = position(world, "a1");
    report(world, "a1", { width: 600, height: 300 });
    report(world, "q1", { width: 400, height: 180 });

    assert.deepEqual(position(world, "a1"), dragged);
    for (const id of Object.keys(world.nodes)) {
      assert.equal(settle(world, id).some((move) => move.id === "a1"), false, `settle(${id})`);
    }
  });

  it("carries the seated subtree of a dragged node and keeps its seats", () => {
    const world = chatWithFollowUp();
    setValue(world, "q2", "go on");
    spawn(world, "a2", "response", ["q2"], { size: { width: 808, height: 400 } });
    spawn(world, "q3", "input", ["a2"], { value: "", size: { width: 400, height: 120 } });
    const before = ["a2", "q3"].map((id) => position(world, id));

    world.nodes = dragNodes(world.nodes, ["q2"], 137, -40);

    ["a2", "q3"].forEach((id, i) =>
      assert.deepEqual(position(world, id), { x: before[i].x + 137, y: before[i].y - 40 })
    );
    assert.equal(world.nodes.q2.seat, undefined);
    assert.equal(world.nodes.a2.seat?.hostId, "q2");
    report(world, "a2", { width: 808, height: 600 });
    assert.equal(world.nodes.q3.y, bottom(world, "a2") + CHILD_BELOW_PARENT_GAP);
  });

  it("keeps the seats inside a dragged selection", () => {
    const world = chatWithFollowUp();
    setValue(world, "q2", "go on");
    spawn(world, "a2", "response", ["q2"], { size: { width: 808, height: 400 } });

    world.nodes = dragNodes(world.nodes, ["q2", "a2"], 50, 50);

    assert.equal(world.nodes.q2.seat, undefined);
    assert.deepEqual(world.nodes.a2.seat, { hostId: "q2", flow: "below", shift: 0 });
  });

  it("lets a follow-up the user nudged keep its column", () => {
    const world = chatWithFollowUp();
    world.nodes = dragNodes(world.nodes, ["q2"], 60, 25);

    spawn(world, "q2b", "input", ["a1"], { pointer: point(300, 0), size: { width: 400, height: 120 } });

    assert.ok(centerX(world, "q2b") - centerX(world, "q2") >= MAX_NODE_WIDTH - 60);
    assert.deepEqual(overlappingPairs(world), []);
  });

  it("stacks three videos under the reply and puts the follow-up under them", () => {
    const world = emptyWorld();
    placeByHand(world, "q1", "input", -200, 0);
    spawn(world, "a1", "response", ["q1"], { size: { width: 808, height: 300 } });
    for (const id of ["y1", "y2", "y3"]) spawn(world, id, "youtube", ["a1"]);
    for (const id of ["y1", "y2", "y3"]) report(world, id, { width: 640, height: 400 });
    spawn(world, "q2", "input", ["a1"], { value: "", size: { width: 400, height: 120 } });

    assert.deepEqual(overlappingPairs(world), []);
    assert.ok(world.nodes.y2.y > world.nodes.y1.y);
    assert.ok(world.nodes.y3.y > world.nodes.y2.y);
    assert.equal(world.nodes.q2.y, bottom(world, "y3") + CHILD_BELOW_PARENT_GAP);
    for (const id of ["y1", "y2", "y3", "q2"]) assert.equal(centerX(world, id), 0);
  });

  it("puts a late video ahead of an existing follow-up", () => {
    const world = chatWithFollowUp();
    spawn(world, "y1", "youtube", ["a1"], { size: { width: 640, height: 400 } });

    assert.equal(world.nodes.y1.y, bottom(world, "a1") + CHILD_BELOW_PARENT_GAP);
    assert.equal(world.nodes.q2.y, bottom(world, "y1") + CHILD_BELOW_PARENT_GAP);
  });

  it("flows a branch sideways when the user dragged its reply beside the prompt", () => {
    const world = emptyWorld();
    placeByHand(world, "q1", "input", -200, 0);
    spawn(world, "a1", "response", ["q1"], { size: { width: 600, height: 300 } });
    world.nodes = dragNodes(world.nodes, ["a1"], 700 - world.nodes.a1.x, 0 - world.nodes.a1.y);

    spawn(world, "q2", "input", ["a1"], { size: { width: 400, height: 120 } });
    spawn(world, "a2", "response", ["q2"], { size: { width: 500, height: 200 } });

    assert.ok(world.nodes.q2.x >= 700 + 600, "follow-up is right of the reply");
    assert.equal(world.nodes.q2.y, 0);
    assert.ok(world.nodes.a2.x >= world.nodes.q2.x + 400, "its reply keeps going right");
    assert.equal(world.nodes.a2.y, 0);
  });

  it("puts a question about two replies under the middle of both", () => {
    const world = emptyWorld();
    placeByHand(world, "left", "response", -900, 0, { width: 600, height: 300 });
    placeByHand(world, "right", "response", 300, 100, { width: 600, height: 400 });

    spawn(world, "q", "input", ["left", "right"], { size: { width: 400, height: 120 } });

    assert.equal(centerX(world, "q"), 0);
    assert.equal(world.nodes.q.y, 500 + CHILD_BELOW_PARENT_GAP);
  });

  it("loads a saved canvas without moving anything as sizes arrive", () => {
    const saved = chatWithFollowUp();
    spawn(saved, "q2b", "input", ["a1"], { pointer: point(300, 0), size: { width: 400, height: 120 } });
    spawn(saved, "a2b", "response", ["q2b"], { size: { width: 808, height: 700 } });
    setValue(saved, "q2", "x");
    spawn(saved, "a2", "response", ["q2"], { size: { width: 500, height: 900 } });

    const loaded: World = { nodes: { ...saved.nodes }, sizes: {} };
    for (const id of Object.keys(saved.nodes)) {
      loaded.sizes[id] = saved.sizes[id];
      assert.deepEqual(settle(loaded, id), [], `report from ${id}`);
    }
  });
});

describe("drop", () => {
  it("centers a single node on the pointer", () => {
    const [spot] = drop(emptyWorld(), { types: ["input"], at: point(100, 50) });
    assert.deepEqual(spot, { x: 100 - 200, y: 50 - 60 });
  });

  it("does not stack two unmeasured nodes dropped on the same point", () => {
    const world = emptyWorld();
    const [first] = drop(world, { types: ["input"], at: point(0, 100) });
    world.nodes.a = makeNode("a", "input", first.x, first.y, "");
    const [second] = drop(world, { types: ["input"], at: point(0, 100) });

    const size = getDefaultNodeDimensions("input");
    assert.equal(overlaps({ ...first, ...size }, { ...second, ...size }), false);
  });

  it("slides out of a node the pointer is inside", () => {
    const world = emptyWorld();
    placeByHand(world, "yt", "youtube", 0, 0, { width: 640, height: 400 });
    const [spot] = drop(world, { types: ["input"], at: point(100, 100) });
    assert.equal(overlaps({ ...spot, ...getDefaultNodeDimensions("input") }, boxOf(world, "yt")), false);
  });

  it("packs five dropped files without overlapping each other or what is there", () => {
    const world = emptyWorld();
    placeByHand(world, "doc", "document", 0, 0);
    const types: NodeType[] = ["image-context", "image-context", "document", "document", "document"];

    const spots = drop(world, { types, at: point(80, 40) });

    const boxes = spots.map((spot, i) => ({ ...spot, ...getDefaultNodeDimensions(types[i]) }));
    boxes.forEach((box, i) => {
      assert.equal(overlaps(box, boxOf(world, "doc")), false, `file ${i} is clear of the node`);
      boxes.slice(i + 1).forEach((other) => assert.equal(overlaps(box, other), false));
    });
  });

  it("lands a summary in the hole the summarized nodes leave", () => {
    const world = emptyWorld();
    placeByHand(world, "a", "context", 0, 0);
    placeByHand(world, "b", "context", 300, 0);
    const hole = centerOfNodes(world, ["a", "b"]);
    assert.ok(hole);
    delete world.nodes.a;
    delete world.nodes.b;

    const [spot] = drop(world, { types: ["summary"], at: hole });

    assert.deepEqual(spot, { x: 238 - 260, y: 48 - 90 });
  });
});

describe("toCanvasPoint", () => {
  it("undoes the pan and zoom", () => {
    const canvasPoint = toCanvasPoint({ x: 300, y: 200 }, { x: 100, y: 50, k: 2 });
    assert.equal(canvasPoint.x, 100);
    assert.equal(canvasPoint.y, 75);
  });
});

describe("hasRenderableContent", () => {
  it("is false while a reply is still empty", () => {
    assert.equal(hasRenderableContent(makeNode("r", "response", 0, 0, "   ")), false);
  });
});

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("placement over random graphs", () => {
  it("settles to a fixed point, never moves a hand-placed node, and never hangs a continuation onto a seated node", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const random = seededRandom(seed);
      const pick = <T,>(items: readonly T[]): T | undefined =>
        items[Math.floor(random() * items.length)];
      const between = (low: number, high: number) => low + Math.round(random() * (high - low));
      const replySize = (): Size => ({ width: between(180, MAX_NODE_WIDTH), height: between(60, 900) });
      const world = emptyWorld();
      placeByHand(world, "n0", "input", -200, 0);
      let count = 0;

      const checkedHang = (
        type: NodeType,
        on: [string, ...string[]],
        value: string,
        pointer?: CanvasPoint
      ): string => {
        const spot = hang(world, { type, on, pointer });
        const box = { x: spot.x, y: spot.y, ...getDefaultNodeDimensions(type) };
        for (const node of Object.values(world.nodes)) {
          if (!node.seat || type === "youtube") continue;
          assert.equal(
            overlaps(box, boxOf(world, node.id)),
            false,
            `seed ${seed}: new ${type} on ${on.join(",")} overlaps seated ${node.id}`
          );
        }
        count += 1;
        const id = `n${count}`;
        add(world, id, type, spot, on, value);
        return id;
      };

      for (let step = 0; step < 30; step += 1) {
        const nodes = Object.values(world.nodes);
        const replies = nodes.filter((node) => node.type === "response" || node.type === "image-response");
        const openPrompts = nodes.filter(
          (node) =>
            node.type === "input" &&
            !node.childrenIds.some((id) => world.nodes[id].type !== "input")
        );
        const roll = random();

        if (roll < 0.25) {
          const prompt = pick(openPrompts);
          if (!prompt) continue;
          const type = random() < 0.2 ? "image-response" : "response";
          const id = checkedHang(type, [prompt.id], random() < 0.25 ? "" : "answer");
          report(world, id, replySize());
        } else if (roll < 0.45) {
          const reply = pick(replies);
          if (!reply) continue;
          const pointer = random() < 0.7 ? point(reply.x + between(-600, 1200), reply.y) : undefined;
          const id = checkedHang("input", [reply.id], "", pointer);
          report(world, id, { width: 400, height: 120 });
        } else if (roll < 0.52) {
          const first = pick(replies);
          const second = pick(replies);
          if (!first || !second || first === second) continue;
          const id = checkedHang("input", [first.id, second.id], "");
          report(world, id, { width: 400, height: 120 });
        } else if (roll < 0.62) {
          const reply = pick(replies);
          if (!reply) continue;
          const burst = Array.from({ length: between(1, 3) }, () =>
            checkedHang("youtube", [reply.id], "video")
          );
          for (const id of burst) report(world, id, { width: 640, height: between(380, 420) });
        } else if (roll < 0.72) {
          const near = pick(nodes);
          if (!near) continue;
          const type = random() < 0.5 ? "context" : "document";
          const [spot] = drop(world, { types: [type], at: point(near.x + between(-300, 900), near.y + between(-200, 900)) });
          count += 1;
          world.nodes[`n${count}`] = makeNode(`n${count}`, type, spot.x, spot.y, "note");
          report(world, `n${count}`, getDefaultNodeDimensions(type));
        } else if (roll < 0.82) {
          const grabbed = pick(nodes);
          if (!grabbed) continue;
          const child = random() < 0.3 ? pick(grabbed.childrenIds) : undefined;
          world.nodes = dragNodes(
            world.nodes,
            child ? [grabbed.id, child] : [grabbed.id],
            between(-600, 600),
            between(-600, 600)
          );
        } else {
          const reply = pick(replies);
          if (!reply) continue;
          if (random() < 0.3) setValue(world, reply.id, reply.value ? "" : "answer");
          report(world, reply.id, replySize());
        }

        for (const id of Object.keys(world.nodes)) {
          const moves = settle(world, id);
          for (const move of moves) {
            assert.ok(world.nodes[move.id].seat, `seed ${seed}: settle(${id}) moved hand-placed ${move.id}`);
            world.nodes[move.id] = { ...world.nodes[move.id], x: move.x, y: move.y };
          }
          assert.deepEqual(settle(world, id), [], `seed ${seed}: settle(${id}) is not a fixed point`);
        }
      }
    }
  });
});
