import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  ESTIMATE_SPAWN_TIMEOUT_MS,
  estimateSpawn,
  estimateSpawnOrText,
} from "./estimateSpawn";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("estimateSpawn", () => {
  it("maps a successful JSON body to a spawn type", async () => {
    globalThis.fetch = (async () =>
      Response.json({
        type: "image",
        probabilities: { text: 0.1, image: 0.8, youtube: 0.1 },
      })) as typeof fetch;

    const result = await estimateSpawn({ prompt: "draw a cat" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.type, "image");
  });

  it("maps AbortError to a timeout Result", async () => {
    globalThis.fetch = (async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as typeof fetch;

    const result = await estimateSpawn({
      prompt: "hello",
      timeoutMs: 50,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /timed out after 50ms/);
  });

  it("maps HTTP errors to a Result", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { error: "AI_GATEWAY_API_KEY is not set" },
        { status: 500 }
      )) as typeof fetch;

    const result = await estimateSpawn({ prompt: "hello" });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /AI_GATEWAY_API_KEY/);
  });
});

describe("estimateSpawnOrText", () => {
  it("defaults to text when estimate fails", async () => {
    globalThis.fetch = (async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }) as typeof fetch;

    const type = await estimateSpawnOrText({
      prompt: "hello",
      timeoutMs: 10,
    });
    assert.equal(type, "text");
    assert.equal(ESTIMATE_SPAWN_TIMEOUT_MS, 5000);
  });
});
