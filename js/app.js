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

async function locate() {
  if (!navigator.geolocation) return;
  state.locating = true;
  render();
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      state.place = await reversePlace(pos.coords.latitude, pos.coords.longitude);
      persist();
      refresh();
    },
    () => {
      state.locating = false;
      render();
    },
  );
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

refresh();
