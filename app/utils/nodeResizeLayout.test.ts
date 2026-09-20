import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { layoutMovesAfterResize } from "./nodeResizeLayout";
import type { GraphNode, GraphNodes } from "../types/GraphCanvas.types";

describe("layoutMovesAfterResize", () => {
  it("centers a generating pill under a measured parent", () => {
    const parent: GraphNode = {
      id: "input-1",
      type: "input",
      x: 0,
      y: 0,
      value: "generate picture of a cat",
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
    const moves = layoutMovesAfterResize({
      node: response,
      width: 220,
      height: 62,
      nodes: { "input-1": parent, "resp-1": response } satisfies GraphNodes,
      dimensions: {
        "input-1": { width: 400, height: 62 },
        "resp-1": { width: 220, height: 62 },
      },
    });
    assert.equal(moves.find((move) => move.nodeId === "resp-1")?.dx, 90);
  });
});
