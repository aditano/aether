import { persist, state } from "./state.js";
import {
  collapseIcon,
  expandIcon,
  closeIcon,
  hasWebGL2,
  inConus,
  pauseIcon,
  playIcon,
  prefersReducedMotion,
  recenterIcon,
} from "./util.js";

const IEM_SUBS = ["", "1", "2", "3"];

const NEXRAD_STOPS = [
  ["#04e9e7", "5"],
  ["#019ff4", "20"],
  ["#02fd02", "30"],
  ["#fdf802", "40"],
  ["#fd9500", "45"],
  ["#fd0000", "50"],
  ["#bc0000", "60"],
  ["#f800fd", "70"],
];
const BLUE_STOPS = [
  ["#3944a8", "5"],
  ["#3d9be8", "20"],
  ["#4ad89c", "30"],
  ["#f0e14a", "40"],
  ["#f08a2a", "50"],
  ["#e23b3b", "60"],
];
const PRECIP_STOPS = [
  ["#b8e986", "0.1"],
  ["#4caf50", "0.3"],
  ["#fdd835", "0.5"],
  ["#fb8c00", "1"],
  ["#e53935", "2"],
  ["#8e24aa", "3+"],
];

let map;
let glLayer;
let overlay;
let fading;
let playTimer;
let marker;
let alertsLayer;
let bound = false;
let lastPaint = 0;
let frames = [];

const $ = (id) => document.getElementById(id);

export function parkRadar() {
  const root = $("radar-root");
  const parkEl = $("radar-park");
  if (root && parkEl) parkEl.appendChild(root);
}

export function dockRadar() {
  const root = $("radar-root");
  if (!root) return;
  document.body.classList.toggle("studio", state.studio);
  if (state.studio) document.body.appendChild(root);
  else {
    const slot = $("radar-slot");
    if (slot) slot.appendChild(root);
    else parkRadar();
  }
  invalidate();
}

function resizeBasemap() {
  if (!map || !glLayer) return;
  try {
    const size = map.getSize();
    const el = glLayer.getContainer?.() || glLayer._container;
    if (el && size.x && size.y) {
      el.style.width = `${size.x}px`;
      el.style.height = `${size.y}px`;
    }
    const gl = glLayer.getMaplibreMap?.();
    gl?.resize();
  } catch {}
}

function invalidate() {
  requestAnimationFrame(() => {
    map?.invalidateSize({ animate: false });
    resizeBasemap();
    setTimeout(() => {
      map?.invalidateSize({ animate: false });
      resizeBasemap();
    }, 250);
  });
}

function n0qFrames() {
  const now = Date.now() / 1000;
  const list = [];
  for (let m = 55; m >= 5; m -= 5) {
    list.push({
      kind: "iem",
      iem: `nexrad-n0q-m${String(m).padStart(2, "0")}m`,
      time: now - m * 60,
      maxNativeZoom: 9,
    });
  }
  list.push({ kind: "iem", iem: "nexrad-n0q", time: now, maxNativeZoom: 9 });
  return list;
}

function hrrrFrames() {
  const now = Date.now() / 1000;
  const list = [];
  for (let m = 0; m <= 180; m += 15) {
    list.push({
      kind: "iem",
      iem: `hrrr::REFD-F${String(m).padStart(4, "0")}-0`,
      time: now + m * 60,
      maxNativeZoom: 8,
      forecast: m,
    });
  }
  return list;
}

export function availableLayers() {
  const conus = inConus(state.place.lat, state.place.lon);
  const list = [{ id: "reflectivity", label: "Reflectivity" }];
  if (conus) {
    list.push({ id: "precip1h", label: "1-hour precip" });
    list.push({ id: "satellite", label: "Satellite" });
    list.push({ id: "hrrr", label: "Forecast" });
  }
  return list;
}

export function buildFrames() {
  const conus = inConus(state.place.lat, state.place.lon);
  const rv = state.bundle?.rainviewer;
  const layer = state.layer;
  if (layer === "precip1h" && conus) {
    return [{ kind: "iem", iem: "q2-n1p", time: Date.now() / 1000, maxNativeZoom: 8 }];
  }
  if (layer === "satellite" && conus) {
    const day = state.bundle?.forecast?.current?.is_day;
    return [
      {
        kind: "iem",
        iem: day ? "goes_east_conus_ch02" : "goes_east_conus_ch13",
        time: Date.now() / 1000,
        maxNativeZoom: 8,
      },
    ];
  }
  if (layer === "hrrr" && conus) return hrrrFrames();
  if (conus) return n0qFrames();
  if (rv?.past?.length) {
    return rv.past.map((f) => ({
      kind: "rainviewer",
      path: f.path,
      host: rv.host,
      time: f.time,
      maxNativeZoom: 7,
    }));
  }
  return [];
}

function sourceLabel() {
  const conus = inConus(state.place.lat, state.place.lon);
  if (state.layer === "precip1h") return "MRMS 1-hour precip · IEM";
  if (state.layer === "satellite") return "GOES · IEM";
  if (state.layer === "hrrr") return "HRRR reflectivity · IEM";
  if (conus) return "NEXRAD mosaic · IEM";
  return "Global composite · RainViewer";
}

function legendStops() {
  if (state.layer === "precip1h") return { title: "in", stops: PRECIP_STOPS };
  if (state.layer === "satellite") return { title: "", stops: [] };
  const conus = inConus(state.place.lat, state.place.lon);
  return { title: "dBZ", stops: conus || state.layer === "hrrr" ? NEXRAD_STOPS : BLUE_STOPS };
}

function frameUrl(frame) {
  if (frame.kind === "rainviewer") {
    return `${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_${state.snow ? "1" : "0"}.png`;
  }
  return `https://mesonet{s}.agron.iastate.edu/cache/tile.py/1.0.0/${frame.iem}/{z}/{x}/{y}.png`;
}

function stampText(frame) {
  if (!frame) return "—";
  if (frame.forecast != null) return frame.forecast === 0 ? "Forecast now" : `+${frame.forecast} min`;
  const tz = state.bundle?.forecast?.timezone;
  return new Date(frame.time * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

function removeLayer(layer) {
  if (!layer || !map) return;
  try {
    map.removeLayer(layer);
  } catch {}
}

function paintFrame() {
  if (!map || !frames.length) {
    updateHud();
    return;
  }
  if (state.frame >= frames.length) state.frame = frames.length - 1;
  if (state.frame < 0) state.frame = 0;
  const frame = frames[state.frame];
  const reduce = prefersReducedMotion();
  const token = ++lastPaint;
  const layer = window.L.tileLayer(frameUrl(frame), {
    opacity: reduce ? state.opacity : 0,
    zIndex: 410,
    pane: "overlayPane",
    maxZoom: 12,
    maxNativeZoom: frame.maxNativeZoom || 9,
    subdomains: frame.kind === "iem" ? IEM_SUBS : "abcd",
    className: "radar-overlay",
    errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  });
  let revealed = false;
  const reveal = () => {
    if (revealed || token !== lastPaint) {
      if (token !== lastPaint) removeLayer(layer);
      return;
    }
    revealed = true;
    layer.setOpacity(state.opacity);
    if (overlay && overlay !== layer) {
      const old = overlay;
      if (reduce) removeLayer(old);
      else {
        fading = old;
        setTimeout(() => {
          if (fading === old) {
            removeLayer(old);
            fading = null;
          }
        }, 220);
      }
    }
    overlay = layer;
  };
  layer.addTo(map);
  layer.once("load", reveal);
  setTimeout(reveal, 850);
  updateHud();
}

function stopPlay() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }
}

function startPlay() {
  stopPlay();
  if (prefersReducedMotion()) state.playing = false;
  if (!state.playing || frames.length < 2) {
    updateHud();
    return;
  }
  playTimer = setInterval(() => {
    state.frame = (state.frame + 1) % frames.length;
    paintFrame();
  }, Math.round(420 / state.speed));
}

function syncMarker() {
  if (!map || !window.L) return;
  const latlng = [state.place.lat, state.place.lon];
  if (!marker) {
    marker = window.L.circleMarker(latlng, {
      radius: 6,
      color: "#c5cdd8",
      weight: 2,
      fillColor: "#eceef2",
      fillOpacity: 0.95,
    }).addTo(map);
  } else marker.setLatLng(latlng);
}

function syncAlerts() {
  if (!map || !window.L) return;
  if (alertsLayer) {
    map.removeLayer(alertsLayer);
    alertsLayer = null;
  }
  const feats = (state.bundle?.alerts || []).filter((a) => a.geometry);
  if (!feats.length) return;
  alertsLayer = window.L.geoJSON(
    {
      type: "FeatureCollection",
      features: feats.map((a) => ({ type: "Feature", geometry: a.geometry, properties: a })),
    },
    {
      style: (feat) => {
        const sev = String(feat.properties?.severity || "").toLowerCase();
        const color = sev === "extreme" || sev === "severe" ? "#c45b5b" : sev === "moderate" ? "#d4a017" : "#c5cdd8";
        return { color, weight: 2, fillOpacity: 0.12, fillColor: color };
      },
      onEachFeature: (feat, layer) => {
        layer.bindPopup(`<strong>${feat.properties.event}</strong><p>${feat.properties.headline || ""}</p>`);
      },
    },
  ).addTo(map);
}

function addBasemap() {
  if (!hasWebGL2() || !window.L?.maplibreGL || !window.maplibregl) return;
  try {
    glLayer = window.L.maplibreGL({
      style: "https://tiles.openfreemap.org/styles/dark",
      attribution:
        '&copy; <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; OSM',
      interactive: false,
      pane: "tilePane",
      padding: 0.05,
    });
    glLayer.addTo(map);
  } catch (err) {
    console.warn("OpenFreeMap basemap unavailable", err);
  }
}

export function ensureMap() {
  const el = $("radar-map");
  if (!el || !window.L || map) {
    invalidate();
    return;
  }
  const zoom = inConus(state.place.lat, state.place.lon) ? 7 : 6;
  map = window.L.map(el, {
    zoomControl: false,
    attributionControl: true,
    minZoom: 3,
    maxZoom: 12,
  }).setView([state.place.lat, state.place.lon], zoom);
  addBasemap();
  window.L.control.zoom({ position: "bottomright" }).addTo(map);
  map.on("resize", resizeBasemap);
  syncMarker();
}

export function recenter() {
  if (!map) return;
  const zoom = inConus(state.place.lat, state.place.lon) ? Math.max(map.getZoom(), 7) : Math.min(Math.max(map.getZoom(), 5), 7);
  map.setView([state.place.lat, state.place.lon], zoom);
}

export function setStudio(on) {
  state.studio = on;
  dockRadar();
  paintChrome();
}

export function toggleStudio() {
  setStudio(!state.studio);
}

function legendHtml() {
  const { title, stops } = legendStops();
  if (!stops.length) return "";
  return `<div class="legend" aria-hidden="true">
    <span class="mono">${title}</span>
    ${stops.map(([c, l]) => `<span class="legend-stop"><i style="background:${c}"></i>${l}</span>`).join("")}
  </div>`;
}

function paintChrome() {
  const layers = availableLayers();
  if (!layers.some((l) => l.id === state.layer)) state.layer = "reflectivity";
  const head = $("radar-head");
  const foot = $("radar-foot");
  const studio = $("studio-hud");
  if (head) {
    head.innerHTML = `
      <div class="radar-head-top">
        <div>
          <p class="kicker">Radar</p>
          <p class="mono" id="radar-source">${frames.length ? sourceLabel() : "Radar unavailable"}</p>
        </div>
        <div class="radar-head-actions">
          <button class="icon-btn" id="recenter" aria-label="Recenter on this place">${recenterIcon}</button>
          <button class="icon-btn" id="studio-toggle" aria-label="${state.studio ? "Exit fullscreen" : "Open radar studio"}">${state.studio ? collapseIcon : expandIcon}</button>
        </div>
      </div>
      <div class="seg seg-wrap" id="radar-layers">
        ${layers.map((l) => `<button type="button" class="${state.layer === l.id ? "on" : ""}" data-layer="${l.id}">${l.label}</button>`).join("")}
      </div>`;
  }
  if (foot) {
    const snow = inConus(state.place.lat, state.place.lon)
      ? ""
      : `<label class="snow-lab"><input type="checkbox" id="radar-snow" ${state.snow ? "checked" : ""}/> Snow</label>`;
    foot.innerHTML = `
      <button class="icon-btn" id="play" aria-label="Play">${pauseIcon}</button>
      <input id="radar-slider" type="range" min="0" max="${Math.max(0, frames.length - 1)}" value="${state.frame}" aria-label="Radar time"/>
      <span class="mono" id="radar-stamp">—</span>
      <label class="opacity-lab"><span class="mono">Opacity</span>
        <input id="radar-opacity" type="range" min="0.25" max="1" step="0.05" value="${state.opacity}"/>
      </label>
      <div class="seg" id="radar-speed">
        <button type="button" data-speed="0.5" class="${state.speed === 0.5 ? "on" : ""}">½×</button>
        <button type="button" data-speed="1" class="${state.speed === 1 ? "on" : ""}">1×</button>
        <button type="button" data-speed="2" class="${state.speed === 2 ? "on" : ""}">2×</button>
      </div>
      ${snow}
      ${legendHtml()}`;
  }
  if (studio) {
    studio.hidden = !state.studio;
    const t = state.bundle?.forecast?.current?.temperature_2m;
    studio.innerHTML = `
      <div class="studio-meta">
        <p class="studio-place">${state.place.name}</p>
        <p class="studio-temp">${t == null ? "" : `${Math.round(t)}°`}</p>
      </div>
      <button class="icon-btn glass" id="studio-close" aria-label="Close radar studio">${closeIcon}</button>`;
  }
  updateHud();
}

function bindRoot() {
  if (bound) return;
  const root = $("radar-root");
  if (!root) return;
  bound = true;
  root.addEventListener("click", (e) => {
    const layerBtn = e.target.closest("[data-layer]");
    if (layerBtn) {
      state.layer = layerBtn.getAttribute("data-layer");
      reloadFrames(true);
      paintChrome();
      paintFrame();
      startPlay();
      return;
    }
    const speedBtn = e.target.closest("[data-speed]");
    if (speedBtn) {
      state.speed = Number(speedBtn.getAttribute("data-speed"));
      persist();
      if (state.playing) startPlay();
      updateHud();
      return;
    }
    if (e.target.closest("#play")) {
      state.playing = !state.playing;
      if (state.playing) startPlay();
      else stopPlay();
      updateHud();
      return;
    }
    if (e.target.closest("#recenter")) {
      recenter();
      return;
    }
    if (e.target.closest("#studio-toggle")) {
      toggleStudio();
      return;
    }
    if (e.target.closest("#studio-close")) {
      setStudio(false);
    }
  });
  root.addEventListener("input", (e) => {
    if (e.target.id === "radar-slider") {
      state.playing = false;
      stopPlay();
      state.frame = Number(e.target.value);
      paintFrame();
    }
    if (e.target.id === "radar-opacity") {
      state.opacity = Number(e.target.value);
      overlay?.setOpacity(state.opacity);
      persist();
    }
  });
  root.addEventListener("change", (e) => {
    if (e.target.id === "radar-snow") {
      state.snow = e.target.checked;
      persist();
      paintFrame();
    }
  });
}

export function updateHud() {
  const stamp = $("radar-stamp");
  const slider = $("radar-slider");
  const play = $("play");
  const src = $("radar-source");
  const frame = frames[state.frame];
  if (stamp) stamp.textContent = stampText(frame);
  if (slider) {
    slider.max = String(Math.max(0, frames.length - 1));
    slider.value = String(state.frame);
    slider.setAttribute("aria-valuetext", stampText(frame));
  }
  if (play) {
    play.innerHTML = state.playing ? pauseIcon : playIcon;
    play.setAttribute("aria-label", state.playing ? "Pause" : "Play");
    play.setAttribute("aria-pressed", String(state.playing));
    play.disabled = frames.length < 2;
  }
  if (src) src.textContent = frames.length ? sourceLabel() : "Radar unavailable for this view";
  document.querySelectorAll("[data-layer]").forEach((btn) => {
    btn.classList.toggle("on", btn.getAttribute("data-layer") === state.layer);
  });
  document.querySelectorAll("[data-speed]").forEach((btn) => {
    btn.classList.toggle("on", Number(btn.getAttribute("data-speed")) === state.speed);
  });
  const toggle = $("studio-toggle");
  if (toggle) {
    toggle.innerHTML = state.studio ? collapseIcon : expandIcon;
    toggle.setAttribute("aria-label", state.studio ? "Exit fullscreen" : "Open radar studio");
  }
}

function reloadFrames(reset) {
  frames = buildFrames();
  if (reset || state.frame >= frames.length) state.frame = Math.max(0, frames.length - 1);
}

export function afterDashboardRender() {
  bindRoot();
  dockRadar();
  ensureMap();
  syncMarker();
  syncAlerts();
  paintChrome();
  invalidate();
}

export function onData({ resetFrame = false } = {}) {
  if (!inConus(state.place.lat, state.place.lon) && ["precip1h", "satellite", "hrrr"].includes(state.layer)) {
    state.layer = "reflectivity";
  }
  reloadFrames(resetFrame);
  bindRoot();
  dockRadar();
  ensureMap();
  if (map) map.setView([state.place.lat, state.place.lon], inConus(state.place.lat, state.place.lon) ? 7 : 6);
  syncMarker();
  syncAlerts();
  paintChrome();
  paintFrame();
  startPlay();
  invalidate();
}
