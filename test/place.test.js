import assert from "node:assert/strict";
import test from "node:test";
import { resolveOpenPlace } from "../js/state.js";
import { placeFromReverse } from "../js/weather.js";

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

test("a downtown fix is named for the city, not a former township", () => {
  const place = placeFromReverse({
    countryCode: "US",
    countryName: "United States of America",
    principalSubdivision: "Illinois",
    city: "Chicago",
    locality: "Chicago",
    localityInfo: {
      administrative: [
        { order: 6, name: "Illinois", description: "state of the United States of America" },
        { order: 7, name: "Cook County", description: "county in Illinois, United States" },
        { order: 8, name: "Chicago", description: "city and county seat of Cook County, and largest city in State of Illinois" },
        { order: 11, name: "South Chicago Township", description: "former township in Cook County, Illinois" },
      ],
    },
  }, 41.8781, -87.6298);
  assert.equal(place.name, "Chicago");
  assert.equal(place.detail, "Illinois, United States");
});

test("a suburb keeps the township instead of the nearest big city", () => {
  const place = placeFromReverse({
    countryCode: "US",
    countryName: "United States of America",
    principalSubdivision: "Pennsylvania",
    city: "Philadelphia",
    locality: "Saint Davids",
    localityInfo: {
      administrative: [
        { order: 5, name: "Pennsylvania", description: "state of the United States of America" },
        { order: 6, name: "Philadelphia", description: "largest city in the U.S. state of Pennsylvania" },
        { order: 7, name: "Delaware County", description: "county in Pennsylvania, United States" },
        { order: 9, name: "Radnor", description: "township in Delaware County, Pennsylvania" },
      ],
    },
  }, 40.0462, -75.3599);
  assert.equal(place.name, "Radnor");
  assert.equal(place.detail, "Pennsylvania, United States");
});

test("a capital is not renamed to its borough", () => {
  const place = placeFromReverse({
    countryCode: "GB",
    countryName: "United Kingdom of Great Britain and Northern Ireland",
    principalSubdivision: "England",
    city: "London",
    locality: "City of Westminster",
    localityInfo: {
      administrative: [
        { order: 6, name: "England", description: "home nation of the United Kingdom" },
        { order: 7, name: "London", description: "capital and largest city of England and the United Kingdom" },
        { order: 12, name: "Westminster", description: "City and borough in London" },
        { order: 13, name: "City of Westminster", description: "City and borough in London" },
      ],
    },
  }, 51.5074, -0.1278);
  assert.equal(place.name, "London");
  assert.equal(place.detail, "England, United Kingdom");
});
