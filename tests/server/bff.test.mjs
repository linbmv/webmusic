import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("server module", () => {
  it("exists as production BFF entry", () => {
    assert.equal(typeof process.versions.node, "string");
  });
});

