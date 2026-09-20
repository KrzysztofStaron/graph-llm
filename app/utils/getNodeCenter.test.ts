import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getNodeCenter } from "./getNodeCenter";

describe("getNodeCenter", () => {
  it("uses the top-left until the node has been measured", () => {
    const center = getNodeCenter(
      {
        id: "img-1",
        type: "image-response",
        x: 10,
        y: 20,
        value: "",
        parentIds: [],
        childrenIds: [],
      },
      {}
    );
    assert.deepEqual(center, { x: 10, y: 20 });
  });

  it("uses the measured box once ResizeObserver has run", () => {
    const center = getNodeCenter(
      {
        id: "img-1",
        type: "image-response",
        x: 0,
        y: 0,
        value: "https://example.com/cat.png",
        parentIds: [],
        childrenIds: [],
      },
      { "img-1": { width: 606, height: 400 } }
    );
    assert.deepEqual(center, { x: 303, y: 200 });
  });
});
