const STORE_KEY = "aether-v2";

export const DEFAULT_PLACE = {
  id: "radnor-pa",
  name: "Radnor",
  detail: "Pennsylvania, United States",
  lat: 40.0462,
  lon: -75.3599,
};

export function resolveOpenPlace(saved, fallback = DEFAULT_PLACE) {
  const place = saved?.place;
  if (place?.lat == null || place.lon == null || !place.name) {
    return { place: fallback, source: "default", locate: true };
  }
  if (saved.placeSource === "search") return { place, source: "search", locate: false };
  if (saved.placeSource === "geo") return { place, source: "geo", locate: true };
  if (place.id && place.id !== fallback.id) return { place, source: "search", locate: false };
  return { place: fallback, source: "default", locate: true };
}

export const state = {
  units: "imperial",
  place: DEFAULT_PLACE,
  placeSource: "default",
  locateSeq: 0,
  saved: [],
  q: "",
  hits: [],
  hitIndex: -1,
  locating: false,
  playing: true,
  frame: 0,
  layer: "reflectivity",
  studio: false,
  opacity: 0.78,
  speed: 1,
  snow: true,
  bundle: null,
  error: null,
  loading: true,
  alertOpen: null,
};

function applyStored(saved) {
  if (!saved) return;
  const open = resolveOpenPlace(saved);
  state.place = open.place;
  state.placeSource = open.source;
  if (saved.units) state.units = saved.units;
  if (Array.isArray(saved.saved)) state.saved = saved.saved;
  if (typeof saved.opacity === "number") state.opacity = saved.opacity;
  if (typeof saved.speed === "number") state.speed = saved.speed;
  if (typeof saved.snow === "boolean") state.snow = saved.snow;
}

try {
  applyStored(JSON.parse(localStorage.getItem(STORE_KEY) || "null"));
} catch {}

try {
  if (!localStorage.getItem(STORE_KEY)) applyStored(JSON.parse(localStorage.getItem("aether-v1") || "null"));
} catch {}

export function persist() {
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      units: state.units,
      place: state.place,
      placeSource: state.placeSource,
      saved: state.saved,
      opacity: state.opacity,
      speed: state.speed,
      snow: state.snow,
    }),
  );
}
