import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHILD_BELOW_PARENT_GAP,
  centeredBelowParent,
  findFreePosition,
  getNodeRect,
  hasRenderableContent,
  layoutMovesForMeasuredNode,
  placeCenteredBelowOrForce,
} from "./placement";
import type { GraphNode, GraphNodes } from "../types/GraphCanvas.types";

describe("centeredBelowParent", () => {
  it("aligns child center with parent center", () => {
    const pos = centeredBelowParent({
      parentX: 0,
      parentY: 0,
      parentWidth: 400,
      parentHeight: 120,
      childWidth: 220,
    });
    assert.equal(pos.x, 90);
    assert.equal(pos.y, 120 + CHILD_BELOW_PARENT_GAP);
    assert.equal(pos.x + 110, 200);
  });
});

describe("getNodeRect", () => {
  it("returns nothing until the node has been measured", () => {
    const node: GraphNode = {
      id: "a",
      type: "response",
      x: 0,
      y: 0,
      value: "",
      parentIds: [],
      childrenIds: [],
    };
    assert.equal(getNodeRect(node, {}), undefined);
  });
});

describe("hasRenderableContent", () => {
  it("is false while a reply is still empty", () => {
    const node: GraphNode = {
      id: "r",
      type: "response",
      x: 0,
      y: 0,
      value: "   ",
      parentIds: [],
      childrenIds: [],
    };
    assert.equal(hasRenderableContent(node), false);
  });
});

describe("layoutMovesForMeasuredNode", () => {
  it("centers a reply under its parent and keeps that center as width changes", () => {
    const parent: GraphNode = {
      id: "input-1",
      type: "input",
      x: 0,
      y: 0,
      value: "hi",
      parentIds: [],
      childrenIds: ["resp-1"],
    };
    const response: GraphNode = {
      id: "resp-1",
      type: "response",
      x: 0,
      y: 150,
      value: "",
      parentIds: ["input-1"],
      childrenIds: [],
    };
    const nodes: GraphNodes = { "input-1": parent, "resp-1": response };
    const parentDim = { "input-1": { width: 400, height: 120 } };

    const reasoning = layoutMovesForMeasuredNode({
      node: response,
      width: 180,
      height: 62,
      nodes,
      dimensions: { ...parentDim, "resp-1": { width: 180, height: 62 } },
    });
    const generating = layoutMovesForMeasuredNode({
      node: response,
      width: 260,
      height: 62,
      nodes,
      dimensions: { ...parentDim, "resp-1": { width: 260, height: 62 } },
    });
    const done: GraphNode = { ...response, value: "hello there" };
    const finalMove = layoutMovesForMeasuredNode({
      node: done,
      width: 520,
      height: 200,
      nodes: { "input-1": parent, "resp-1": done },
      dimensions: { ...parentDim, "resp-1": { width: 520, height: 200 } },
    });

    assert.equal(0 + 180 / 2 + (reasoning.find((m) => m.nodeId === "resp-1")?.dx ?? 0), 200);
    assert.equal(0 + 260 / 2 + (generating.find((m) => m.nodeId === "resp-1")?.dx ?? 0), 200);
    assert.equal(0 + 520 / 2 + (finalMove.find((m) => m.nodeId === "resp-1")?.dx ?? 0), 200);
  });

  it("centers a growing image and parks the follow-up under it", () => {
    const image: GraphNode = {
      id: "img-1",
      type: "image-response",
      x: 0,
      y: 150,
      value: "https://example.com/cat.png",
      parentIds: ["input-1"],
      childrenIds: ["input-2"],
    };
    const followUp: GraphNode = {
      id: "input-2",
      type: "input",
      x: 0,
      y: 40,
      value: "",
      parentIds: ["img-1"],
      childrenIds: [],
    };
    const nodes: GraphNodes = {
      "img-1": image,
      "input-1": {
        id: "input-1",
        type: "input",
        x: 0,
        y: 0,
        value: "cat",
        parentIds: [],
        childrenIds: ["img-1"],
      },
      "input-2": followUp,
    };
    const moves = layoutMovesForMeasuredNode({
      node: image,
      width: 606,
      height: 400,
      nodes,
      dimensions: {
        "img-1": { width: 606, height: 400 },
        "input-1": { width: 400, height: 120 },
        "input-2": { width: 400, height: 120 },
      },
    });
    const imageDx = moves.find((m) => m.nodeId === "img-1")?.dx ?? 0;
    const imageDy = moves.find((m) => m.nodeId === "img-1")?.dy ?? 0;
    const followDx = moves.find((m) => m.nodeId === "input-2")?.dx ?? 0;
    const followDy = moves.find((m) => m.nodeId === "input-2")?.dy ?? 0;
    const imageX = 0 + imageDx;
    const imageY = 150 + imageDy;
    assert.equal(imageX + 303, 200);
    assert.equal(0 + followDx + 200, imageX + 303);
    assert.equal(40 + followDy, imageY + 400 + CHILD_BELOW_PARENT_GAP);
  });

  it("does not snap a follow-up under a response that is still generating", () => {
    const response: GraphNode = {
      id: "resp-1",
      type: "response",
      x: 0,
      y: 0,
      value: "",
      parentIds: ["input-1"],
      childrenIds: ["input-2"],
    };
    const followUp: GraphNode = {
      id: "input-2",
      type: "input",
      x: 0,
      y: 400,
      value: "",
      parentIds: ["resp-1"],
      childrenIds: [],
    };
    const moves = layoutMovesForMeasuredNode({
      node: response,
      width: 180,
      height: 60,
      nodes: { "resp-1": response, "input-2": followUp },
      dimensions: {
        "resp-1": { width: 180, height: 60 },
        "input-2": { width: 400, height: 120 },
      },
    });
    assert.equal(moves.find((move) => move.nodeId === "input-2"), undefined);
  });

  it("uses force when the centered slot is already occupied", () => {
    const parent: GraphNode = {
      id: "input-1",
      type: "input",
      x: 0,
      y: 0,
      value: "hi",
      parentIds: [],
      childrenIds: ["resp-1"],
    };
    const response: GraphNode = {
      id: "resp-1",
      type: "response",
      x: 0,
      y: 0,
      value: "ok",
      parentIds: ["input-1"],
      childrenIds: [],
    };
    const blocker: GraphNode = {
      id: "block",
      type: "context",
      x: 90,
      y: 120 + CHILD_BELOW_PARENT_GAP,
      value: "nope",
      parentIds: [],
      childrenIds: [],
    };
    const desired = centeredBelowParent({
      parentX: 0,
      parentY: 0,
      parentWidth: 400,
      parentHeight: 120,
      childWidth: 220,
    });
    const placed = placeCenteredBelowOrForce({
      parentX: 0,
      parentY: 0,
      parentWidth: 400,
      parentHeight: 120,
      childWidth: 220,
      childHeight: 80,
      nodes: { "input-1": parent, "resp-1": response, block: blocker },
      dimensions: {
        "input-1": { width: 400, height: 120 },
        "resp-1": { width: 220, height: 80 },
        block: { width: 220, height: 80 },
      },
      ignoreIds: ["resp-1"],
    });
    assert.equal(placed.x, desired.x);
    assert.equal(placed.y === desired.y, false);
  });

  it("slides a 1px-spawned image left so its center matches the prompt", () => {
    const parent: GraphNode = {
      id: "input-1",
      type: "input",
      x: -200,
      y: 0,
      value: "cat",
      parentIds: [],
      childrenIds: ["img-1"],
    };
    const image: GraphNode = {
      id: "img-1",
      type: "image-response",
      x: -1,
      y: 155,
      value: "https://example.com/cat.png",
      parentIds: ["input-1"],
      childrenIds: [],
    };
    const moves = layoutMovesForMeasuredNode({
      node: image,
      width: 606,
      height: 400,
      nodes: { "input-1": parent, "img-1": image },
      dimensions: {
        "input-1": { width: 400, height: 120 },
        "img-1": { width: 1, height: 1 },
      },
    });
    const nextX = image.x + (moves.find((m) => m.nodeId === "img-1")?.dx ?? 0);
    assert.equal(nextX, -303);
    assert.equal(nextX + 303, 0);
  });

  it("recenters a loaded image under the prompt and drops the follow-up under the image", () => {
    const spinner: GraphNode = {
      id: "img-1",
      type: "image-response",
      x: -103,
      y: 152,
      value: "https://example.com/cat.png",
      parentIds: ["input-1"],
      childrenIds: ["input-2"],
    };
    const followUp: GraphNode = {
      id: "input-2",
      type: "input",
      x: 0,
      y: 200,
      value: "",
      parentIds: ["img-1"],
      childrenIds: [],
    };
    const parent: GraphNode = {
      id: "input-1",
      type: "input",
      x: 0,
      y: 0,
      value: "cat",
      parentIds: [],
      childrenIds: ["img-1"],
    };
    const grown = layoutMovesForMeasuredNode({
      node: spinner,
      width: 606,
      height: 400,
      nodes: { "img-1": spinner, "input-1": parent, "input-2": followUp },
      dimensions: {
        "img-1": { width: 200, height: 80 },
        "input-1": { width: 400, height: 120 },
        "input-2": { width: 400, height: 138 },
      },
    });
    const imageX = spinner.x + (grown.find((m) => m.nodeId === "img-1")?.dx ?? 0);
    const imageY = spinner.y + (grown.find((m) => m.nodeId === "img-1")?.dy ?? 0);
    const followX = followUp.x + (grown.find((m) => m.nodeId === "input-2")?.dx ?? 0);
    const followY = followUp.y + (grown.find((m) => m.nodeId === "input-2")?.dy ?? 0);
    assert.equal(imageX + 303, 200);
    assert.equal(followX + 200, imageX + 303);
    assert.equal(followY, imageY + 400 + CHILD_BELOW_PARENT_GAP);
  });
});

describe("findFreePosition", () => {
  it("does not stack two unmeasured nodes on the same origin", () => {
    const first: GraphNode = {
      id: "a",
      type: "response",
      x: 0,
      y: 100,
      value: "",
      parentIds: [],
      childrenIds: [],
    };
    const second = findFreePosition(0, 100, 1, 1, { a: first }, {}, "below");
    assert.equal(second.x === 0 && second.y === 100, false);
  });
});
