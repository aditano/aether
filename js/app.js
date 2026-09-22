import { onData, setStudio, toggleStudio } from "./radar.js";
import { persist, state } from "./state.js";
import { prefersReducedMotion } from "./util.js";
import { render } from "./ui.js";
import { loadWeather, reversePlace } from "./weather.js";

if (prefersReducedMotion()) state.playing = false;

async function refresh({ silent = false } = {}) {
  if (!silent && !state.bundle) {
    state.loading = true;
    state.error = null;
    render();
  }
  try {
    const bundle = await loadWeather(state.place.lat, state.place.lon, state.units);
    state.bundle = bundle;
    state.error = null;
    state.loading = false;
    state.locating = false;
    onData({ resetFrame: !silent });
    render();
  } catch (err) {
    state.loading = false;
    state.locating = false;
    if (!state.bundle) state.error = err;
    render();
  }
}

function locate({ initial = false } = {}) {
  const seq = ++state.locateSeq;
  const stillCurrent = () => state.locateSeq === seq;
  if (!navigator.geolocation) {
    state.locating = false;
    if (initial) refresh();
    return;
  }
  state.locating = true;
  if (!state.bundle) state.loading = true;
  render();
  const giveUp = () => {
    if (!stillCurrent()) return;
    state.locating = false;
    if (initial && !state.bundle) refresh();
    else render();
  };
  const request = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!stillCurrent()) return;
        state.place = await reversePlace(pos.coords.latitude, pos.coords.longitude);
        if (!stillCurrent()) return;
        state.placeSource = "geo";
        persist();
        refresh();
      },
      giveUp,
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  };
  if (!initial || !navigator.permissions?.query) {
    request();
    return;
  }
  navigator.permissions
    .query({ name: "geolocation" })
    .then((perm) => {
      if (!stillCurrent()) return;
      if (perm?.state === "denied") giveUp();
      else request();
    })
    .catch(request);
}

window.addEventListener("aether:refresh", () => refresh());
window.addEventListener("aether:locate", () => locate());

window.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
    e.preventDefault();
    document.getElementById("q")?.focus();
  }
  if ((e.key === "f" || e.key === "F") && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
    e.preventDefault();
    toggleStudio();
  }
  if (e.key === "Escape" && state.studio) setStudio(false);
});

setInterval(() => refresh({ silent: true }), 5 * 60 * 1000);

if (state.placeSource === "search") refresh();
else locate({ initial: true });
