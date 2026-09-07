const STORE_KEY = "aether-v2";

export const DEFAULT_PLACE = {
  id: "radnor-pa",
  name: "Radnor",
  detail: "Pennsylvania, United States",
  lat: 40.0462,
  lon: -75.3599,
};

export const state = {
  units: "imperial",
  place: DEFAULT_PLACE,
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

try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  if (saved?.place) state.place = saved.place;
  if (saved?.units) state.units = saved.units;
  if (Array.isArray(saved?.saved)) state.saved = saved.saved;
  if (typeof saved?.opacity === "number") state.opacity = saved.opacity;
  if (typeof saved?.speed === "number") state.speed = saved.speed;
  if (typeof saved?.snow === "boolean") state.snow = saved.snow;
} catch {}

try {
  const legacy = JSON.parse(localStorage.getItem("aether-v1") || "null");
  if (legacy && !localStorage.getItem(STORE_KEY)) {
    if (legacy.place) state.place = legacy.place;
    if (legacy.units) state.units = legacy.units;
    if (Array.isArray(legacy.saved)) state.saved = legacy.saved;
  }
} catch {}

export function persist() {
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      units: state.units,
      place: state.place,
      saved: state.saved,
      opacity: state.opacity,
      speed: state.speed,
      snow: state.snow,
    }),
  );
}
