import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { cacheControl } from "../../server.mjs";

describe("server module", () => {
  it("keeps the app shell fresh", () => {
    assert.equal(cacheControl(join("dist", "index.html"), ""), "no-cache");
  });

  it("marks Vite build assets as immutable", () => {
    assert.equal(cacheControl(join("dist", "assets", "app.js"), "assets/app.js"), "public, max-age=31536000, immutable");
  });

  it("recognizes Windows-normalized asset paths", () => {
    assert.equal(cacheControl(join("dist", "assets", "app.css"), "assets\\app.css"), "public, max-age=31536000, immutable");
  });

  it("keeps other static files short lived", () => {
    assert.equal(cacheControl(join("dist", "favicon.ico"), "favicon.ico"), "public, max-age=3600");
  });
});
