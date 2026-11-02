import assert from "node:assert/strict";
import test from "node:test";
import { studioHudHtml } from "../js/radar.js";

test("studio HUD escapes a hostile place name before innerHTML", () => {
  const hostile = `<img src=x onerror="alert(1)">evil</img>`;
  const html = studioHudHtml(hostile, 72);
  assert.match(html, /class="studio-place"/);
  assert.doesNotMatch(html, /<img\b/);
  assert.doesNotMatch(html, /onerror=/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;evil&lt;\/img&gt;/);
  assert.match(html, />72°</);
});

test("studio HUD leaves a normal place name readable", () => {
  const html = studioHudHtml("Saint David's", null);
  assert.match(html, /Saint David&#39;s/);
  assert.match(html, /class="studio-temp"><\/p>/);
});
