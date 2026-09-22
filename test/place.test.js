import assert from "node:assert/strict";
import test from "node:test";
import { resolveOpenPlace } from "../js/state.js";

const fallback = {
  id: "radnor-pa",
  name: "Radnor",
  detail: "Pennsylvania, United States",
  lat: 40.0462,
  lon: -75.3599,
};

const seattle = { id: "12", name: "Seattle", detail: "Washington, United States", lat: 47.6, lon: -122.3 };

test("a first visit asks the browser where you are", () => {
  const open = resolveOpenPlace(null, fallback);
  assert.equal(open.locate, true);
  assert.equal(open.place.name, "Radnor");
  assert.equal(open.source, "default");
});

test("a searched city stays on the next visit", () => {
  const open = resolveOpenPlace({ place: seattle, placeSource: "search" }, fallback);
  assert.equal(open.locate, false);
  assert.equal(open.place.name, "Seattle");
});

test("a previous device fix is refreshed from the browser", () => {
  const open = resolveOpenPlace({ place: seattle, placeSource: "geo" }, fallback);
  assert.equal(open.locate, true);
  assert.equal(open.place.name, "Seattle");
});

test("an older save of a chosen city is kept", () => {
  const open = resolveOpenPlace({ place: seattle }, fallback);
  assert.equal(open.locate, false);
  assert.equal(open.place.name, "Seattle");
});

test("an older save of the built-in default still asks for a location", () => {
  const open = resolveOpenPlace({ place: fallback }, fallback);
  assert.equal(open.locate, true);
  assert.equal(open.source, "default");
});
