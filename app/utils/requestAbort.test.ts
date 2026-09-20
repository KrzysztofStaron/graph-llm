import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  abortRequestsForNodes,
  isAbortError,
  removedNodeIds,
  throwIfAborted,
} from "./requestAbort";
import { graphReducer } from "../interfaces/TreeManager";
import type { GraphNode, GraphNodes } from "../types/GraphCanvas.types";

function node(id: string, extra?: Partial<GraphNode>): GraphNode {
  return {
    id,
    type: "response",
    x: 0,
    y: 0,
    value: "",
    parentIds: [],
    childrenIds: [],
    ...extra,
  };
}

describe("removedNodeIds", () => {
  it("lists ids that disappeared from the graph", () => {
    const before: GraphNodes = {
      input: node("input", { type: "input", childrenIds: ["child"] }),
      child: node("child", {
        type: "image-response",
        parentIds: ["input"],
        status: "streaming",
      }),
    };
    const after = graphReducer(before, { type: "DELETE_CASCADE", id: "child" });
    assert.deepEqual(removedNodeIds(before, after), ["child"]);
  });
});

describe("abortRequestsForNodes", () => {
  it("aborts the in-flight request for a deleted node", () => {
    const controller = new AbortController();
    const abortByNodeId = new Map<string, AbortController>([
      ["child", controller],
      ["other", new AbortController()],
    ]);

    abortRequestsForNodes(abortByNodeId, ["child"]);

    assert.equal(controller.signal.aborted, true);
    assert.equal(abortByNodeId.has("child"), false);
    assert.equal(abortByNodeId.has("other"), true);
    assert.equal(abortByNodeId.get("other")?.signal.aborted, false);
  });
});

describe("isAbortError", () => {
  it("recognizes AbortError", () => {
    const error = new Error("Aborted");
    error.name = "AbortError";
    assert.equal(isAbortError(error), true);
    assert.equal(isAbortError(new Error("network")), false);
  });
});

describe("throwIfAborted", () => {
  it("throws when the signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort();
    assert.throws(() => throwIfAborted(controller.signal), (error: unknown) => {
      return error instanceof Error && error.name === "AbortError";
    });
  });
});
