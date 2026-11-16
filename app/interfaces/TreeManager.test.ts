import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { graphReducer } from "./TreeManager";
import type { GraphNodes } from "../types/GraphCanvas.types";

describe("graphReducer DRAG_NODES", () => {
  it("unseats the grabbed node and carries what is seated on it", () => {
    const nodes: GraphNodes = {
      q1: { id: "q1", type: "input", x: -200, y: 0, value: "hi", parentIds: [], childrenIds: ["a1"] },
      a1: {
        id: "a1",
        type: "response",
        x: -200,
        y: 155,
        value: "hello",
        parentIds: ["q1"],
        childrenIds: ["q2"],
        seat: { hostId: "q1", flow: "below", shift: 0 },
      },
      q2: {
        id: "q2",
        type: "input",
        x: -200,
        y: 490,
        value: "",
        parentIds: ["a1"],
        childrenIds: [],
        seat: { hostId: "a1", flow: "below", shift: 0 },
      },
    };

    const next = graphReducer(nodes, { type: "DRAG_NODES", ids: ["a1"], dx: 300, dy: -20 });

    assert.deepEqual({ x: next.a1.x, y: next.a1.y, seat: next.a1.seat }, { x: 100, y: 135, seat: undefined });
    assert.deepEqual({ x: next.q2.x, y: next.q2.y }, { x: 100, y: 470 });
    assert.deepEqual(next.q2.seat, { hostId: "a1", flow: "below", shift: 0 });
    assert.equal(next.q1, nodes.q1);
  });
});
