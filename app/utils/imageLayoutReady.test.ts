import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { imageCardHasLayoutSize } from "./imageLayoutReady";

describe("imageCardHasLayoutSize", () => {
  it("treats the 520px grid-reveal card as painted without an img", () => {
    assert.equal(
      imageCardHasLayoutSize({
        shellWidth: 520,
        shellHeight: 520,
        revealWidth: 520,
        revealHeight: 520,
      }),
      true
    );
  });

  it("does not wait for a 606px img when the card is already laid out", () => {
    assert.equal(
      imageCardHasLayoutSize({
        shellWidth: 520,
        shellHeight: 520,
        revealWidth: 520,
        revealHeight: 520,
        img: { complete: false, naturalWidth: 1408, offsetWidth: 0 },
      }),
      true
    );
  });

  it("stays false on the old 1x1 spawn", () => {
    assert.equal(
      imageCardHasLayoutSize({
        shellWidth: 1,
        shellHeight: 1,
        revealWidth: 1,
        revealHeight: 1,
      }),
      false
    );
  });

  it("stays false while the response pill is still mounted", () => {
    assert.equal(
      imageCardHasLayoutSize({
        shellWidth: 200,
        shellHeight: 40,
      }),
      false
    );
  });

  it("still accepts a painted legacy img", () => {
    assert.equal(
      imageCardHasLayoutSize({
        shellWidth: 606,
        shellHeight: 400,
        img: { complete: true, naturalWidth: 1408, offsetWidth: 606 },
      }),
      true
    );
  });
});
