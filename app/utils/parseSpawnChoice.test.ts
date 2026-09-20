import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSpawnChoice, spawnNodeType } from "./parseSpawnChoice";

describe("parseSpawnChoice", () => {
  it("returns the chosen spawn type", () => {
    const result = parseSpawnChoice({
      type: "choice",
      choice: "image",
      probabilities: {
        text: 0.1,
        image: 0.8,
        youtube: 0.1,
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.type, "image");
    assert.equal(result.probabilities.image, 0.8);
  });

  it("falls back to the highest probability when choice is unknown", () => {
    const result = parseSpawnChoice({
      type: "choice",
      choice: "nope",
      probabilities: {
        text: 0.2,
        image: 0.1,
        youtube: 0.7,
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.type, "youtube");
  });

  it("returns an error when a key is missing", () => {
    const result = parseSpawnChoice({
      type: "choice",
      choice: "text",
      probabilities: {
        text: 0.5,
        image: 0.5,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /missing probability for youtube/);
  });

  it("returns an error when probabilities are all zero", () => {
    const result = parseSpawnChoice({
      type: "choice",
      choice: "text",
      probabilities: {
        text: 0,
        image: 0,
        youtube: 0,
      },
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /all zero/);
  });

  it("returns an error for a non-object answer", () => {
    const result = parseSpawnChoice(null);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /not an object/);
  });
});

describe("spawnNodeType", () => {
  it("maps image to image-response and others to response", () => {
    assert.equal(spawnNodeType("image"), "image-response");
    assert.equal(spawnNodeType("text"), "response");
    assert.equal(spawnNodeType("youtube"), "response");
  });
});
