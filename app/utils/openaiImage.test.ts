import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateImageOnClient } from "./openaiImage";

describe("generateImageOnClient", () => {
  it("does not start generation when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      () =>
        generateImageOnClient({
          prompt: "a red cube",
          images: [],
          signal: controller.signal,
        }),
      (error: unknown) => isNamedAbortError(error)
    );
  });
});

function isNamedAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
