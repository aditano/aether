import { arcLayout, buildArc } from "./arc.js";
import { composeBriefing } from "./briefing.js";
import { moonDisc, weatherIcon } from "./icons.js";
import { afterDashboardRender, parkRadar } from "./radar.js";
import { persist, state } from "./state.js";
import {
  alertTone,
  cardinalName,
  esc,
  fmtCoord,
  fmtLong,
  fmtPrecip,
  fmtWhen,
  locateIcon,
  moonPhase,
  proseTime,
  searchIcon,
  starIcon,
  timeOfDay,
  todayDailyIndex,
  weatherInfo,
  weekday,
} from "./util.js";
import { searchPlaces } from "./weather.js";

let arcModel = null;
let lastArcKey = "";

function arcKey() {
  const layout = arcLayout(window.innerWidth);
  return `${layout.width}:${layout.height}:${layout.labelEvery}`;
}

function applySky(kind, tod) {
  const nextKind = kind || "clear";
  const nextTod = tod || "day";
  document.documentElement.dataset.kind = nextKind;
  document.documentElement.dataset.tod = nextTod;
  const sky = document.getElementById("sky");
  if (!sky) return;
  sky.dataset.kind = nextKind;
  sky.dataset.tod = nextTod;
}

function windRose(speed, gust, dir, units, gloss) {
  const deg = dir ?? 0;
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10)
    .map((d) => {
      const rad = ((d - 90) * Math.PI) / 180;
      const inner = d % 90 === 0 ? 70 : d % 30 === 0 ? 76 : 80;
      return `<line x1="${100 + inner * Math.cos(rad)}" y1="${100 + inner * Math.sin(rad)}" x2="${100 + 86 * Math.cos(rad)}" y2="${100 + 86 * Math.sin(rad)}" stroke="currentColor" stroke-opacity="${d % 90 === 0 ? 0.55 : 0.18}" stroke-width="${d % 90 === 0 ? 1.5 : 1}"/>`;
    })
    .join("");
  const labels = ["N", "E", "S", "W"]
    .map((lab, i) => {
      const rad = ((i * 90 - 90) * Math.PI) / 180;
      return `<text x="${100 + 96 * Math.cos(rad)}" y="${100 + 96 * Math.sin(rad)}" text-anchor="middle" dominant-baseline="middle" fill="#8b909a" font-size="10">${lab}</text>`;
    })
    .join("");
  const spd = speed == null ? "—" : Math.round(speed);
  const gst = gust == null ? "—" : Math.round(gust);
  const from = dir == null ? "" : `from the ${cardinalName(deg)}`;
  return `<article class="panel wind-panel">
      <div class="row-split">
        <p class="kicker">Wind</p><p class="mono">${esc(from)}</p>
      </div>
      <div class="wind-wrap">
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" stroke-opacity="0.16"/>
          ${ticks}${labels}
          <g transform="rotate(${deg} 100 100)">
            <polygon points="100,22 108,58 92,58" fill="currentColor"/>
            <line x1="100" y1="58" x2="100" y2="108" stroke="currentColor" stroke-width="2"/>
            <circle cx="100" cy="112" r="3" fill="currentColor"/>
          </g>
        </svg>
        <div class="center"><p class="stat" style="margin:0">${spd}</p><p class="mono">${units === "imperial" ? "mph" : "km/h"}</p></div>
      </div>
      <p class="detail wind-gust">Gusts ${gst} ${units === "imperial" ? "mph" : "km/h"}</p>
      ${gloss ? `<p class="gloss wind-gloss">${esc(gloss)}</p>` : ""}
    </article>`;
}

function readingRow(row) {
  return `<div>
      <dt>${esc(row.label)}</dt>
      <dd>
        <p class="stat">${esc(row.value)}</p>
        ${row.note ? `<p class="detail">${esc(row.note)}</p>` : ""}
        ${row.gloss ? `<p class="gloss">${esc(row.gloss)}</p>` : ""}
      </dd>
    </div>`;
}

function chromeHeader() {
  const { place, units, saved, locating } = state;
  const starred = saved.some((s) => s.id === place.id);
  return `
    <header class="top">
      <div>
        <p class="brand-kicker">Observatory</p>
        <p class="brand-title">Aether</p>
      </div>
      <div class="dock">
        <div class="search-box">
          ${searchIcon}
          <input id="q" placeholder="Search a city" aria-label="Search a city" value="${esc(state.q)}" autocomplete="off" role="combobox" aria-expanded="${state.hits.length > 0}" aria-controls="hits"/>
          ${
            state.hits.length
              ? `<div class="hits" id="hits" role="listbox">${state.hits
                  .map(
                    (h, i) =>
                      `<button type="button" role="option" data-pick="${esc(h.id)}" class="${i === state.hitIndex ? "on" : ""}"><span>${esc(h.name)}</span><small>${esc(h.detail)}</small></button>`,
                  )
                  .join("")}</div>`
              : ""
          }
        </div>
        <button class="icon-btn ${locating ? "busy" : ""}" id="locate" aria-label="Use my location" aria-busy="${locating}">${locateIcon}</button>
        <button class="icon-btn ${starred ? "star on" : ""}" id="star" aria-label="Save this place">${starIcon}</button>
        <div class="seg">
          <button data-units="imperial" class="${units === "imperial" ? "on" : ""}">°F</button>
          <button data-units="metric" class="${units === "metric" ? "on" : ""}">°C</button>
        </div>
      </div>
    </header>
    ${
      saved.length
        ? `<div class="saved">${saved
            .map((s) => `<button class="chip ${s.id === place.id ? "on" : ""}" data-saved="${esc(s.id)}">${esc(s.name)}</button>`)
            .join("")}</div>`
        : ""
    }`;
}

function radarSlot() {
  return `<article class="panel radar" id="radar-slot"></article>`;
}

function alertsHtml(alerts, tz) {
  if (!alerts?.length) return "";
  return alerts
    .map((a) => {
      const open = state.alertOpen === a.id;
      const until = fmtWhen(a.ends, tz);
      return `<article class="alert tone-${alertTone(a.severity)}">
        <button type="button" class="alert-head" data-alert="${esc(a.id)}" aria-expanded="${open}">
          <span><strong>${esc(a.event)}</strong>${a.severity ? `<span class="mono"> · ${esc(a.severity)}</span>` : ""}</span>
          ${until ? `<span class="mono">until ${esc(until)}</span>` : ""}
        </button>
        <p class="alert-line">${esc(a.headline)}</p>
        ${
          open
            ? `<div class="alert-body">${esc(a.description)}${a.instruction ? `<p class="detail">${esc(a.instruction)}</p>` : ""}</div>`
            : ""
        }
      </article>`;
    })
    .join("");
}

function skeleton() {
  const finding = state.locating ? `<p class="kicker locate-note">Finding your location</p>` : "";
  return `<div class="hero-open">${finding}<div class="spin" style="height:16rem"></div></div>
    ${radarSlot()}
    <div class="spin" style="height:13rem"></div>
    <div class="grid-read"><div class="spin" style="height:16rem"></div><div class="spin" style="height:16rem"></div></div>
    <div class="spin" style="height:18rem"></div>`;
}

export function render() {
  const root = document.getElementById("app");
  parkRadar();
  const { place, units, loading, error, bundle } = state;
  const header = chromeHeader();

  if (loading && !bundle) {
    document.title = "Aether";
    arcModel = null;
    root.innerHTML = header + skeleton();
    bindChrome();
    try { afterDashboardRender(); } catch (err) { console.warn(err); }
    return;
  }
  if ((error || !bundle) && !bundle) {
    document.title = "Aether";
    arcModel = null;
    root.innerHTML =
      header +
      `<article class="panel error" aria-live="polite"><p class="place">Could not load the sky</p><p class="detail">The public weather sources did not respond. Try another city, or retry.</p><button class="chip" id="retry" type="button">Try again</button></article>`;
    bindChrome();
    try { afterDashboardRender(); } catch (err) { console.warn(err); }
    return;
  }

  const f = bundle.forecast;
  const c = f.current;
  const info = weatherInfo(c.weather_code, c.is_day);
  const dayIdx = todayDailyIndex(f);
  const briefing = composeBriefing(f, units, { alerts: bundle.alerts, air: bundle.air });
  arcModel = buildArc(f, units, arcLayout(window.innerWidth));
  lastArcKey = arcKey();
  const tod = timeOfDay(c.time, f.daily.sunrise?.[dayIdx], f.daily.sunset?.[dayIdx], c.is_day);
  applySky(info.kind, tod);
  const rounded = c.temperature_2m == null ? "—" : Math.round(c.temperature_2m);
  document.title = `${rounded}° ${place.name} · Aether`;

  const hi = f.daily.temperature_2m_max?.[dayIdx];
  const lo = f.daily.temperature_2m_min?.[dayIdx];
  const days = f.daily.time.slice(dayIdx, dayIdx + 10).map((t, i) => ({
    t,
    code: f.daily.weather_code[dayIdx + i],
    max: f.daily.temperature_2m_max[dayIdx + i],
    min: f.daily.temperature_2m_min[dayIdx + i],
    pop: f.daily.precipitation_probability_max[dayIdx + i],
    precip: f.daily.precipitation_sum?.[dayIdx + i],
    wind: f.daily.wind_speed_10m_max?.[dayIdx + i],
  }));
  const ranged = days.filter((d) => d.min != null && d.max != null);
  const weekMin = ranged.length ? Math.min(...ranged.map((d) => d.min)) : 0;
  const weekMax = ranged.length ? Math.max(...ranged.map((d) => d.max)) : 1;
  const span = Math.max(1, weekMax - weekMin);
  const moon = moonPhase(new Date());

  root.innerHTML = header + `
      ${alertsHtml(bundle.alerts, f.timezone)}
      <section class="hero-open">
        <p class="kicker">${esc(fmtLong(c.time, f.timezone))}</p>
        <h1 class="place">${esc(place.name)}</h1>
        <p class="detail">${esc(place.detail)}</p>
        <p class="mono hero-meta">${esc(fmtCoord(place.lat, place.lon))} · ${esc(proseTime(c.time))}</p>
        <div class="hero-split">
          <div class="hero-copy">
            <h2 id="wx-headline">${esc(briefing.headline)}</h2>
            ${briefing.support ? `<p class="support">${esc(briefing.support)}</p>` : ""}
            ${briefing.practical ? `<p class="practical">${esc(briefing.practical)}</p>` : ""}
          </div>
          <div class="hero-now">
            <p class="temp">${rounded}°</p>
            <div class="now-meta">
              ${weatherIcon(info.kind, c.is_day, 28, "wx-icon")}
              <div>
                <p>${esc(info.label)}</p>
                <p class="muted">${c.apparent_temperature == null ? "" : `Feels ${Math.round(c.apparent_temperature)}°`}</p>
                <p class="mono">${hi == null ? "" : `H ${Math.round(hi)}°`}${hi != null && lo != null ? " · " : ""}${lo == null ? "" : `L ${Math.round(lo)}°`}</p>
                ${briefing.hourNote ? `<p class="mono hour-note">${esc(briefing.hourNote)}</p>` : ""}
              </div>
            </div>
          </div>
        </div>
      </section>
      ${radarSlot()}
      <section class="panel">
        <p class="kicker">The day</p>
        ${
          arcModel
            ? `<p class="arc-caption">${esc(arcModel.caption)}</p>
               <div class="arc-stage" id="arc-wrap" tabindex="0">
                 ${arcModel.svg}
                 <div class="arc-tip" id="arc-tip" hidden></div>
               </div>`
            : `<p class="detail">Not enough hours yet to draw the day.</p>`
        }
      </section>
      <div class="grid-read">
        ${windRose(c.wind_speed_10m, c.wind_gusts_10m, c.wind_direction_10m, units, briefing.windGloss)}
        <article class="panel">
          <p class="kicker">Readings</p>
          ${
            briefing.rows.length
              ? `<dl class="readings">${briefing.rows.map(readingRow).join("")}</dl>`
              : `<p class="detail">The instruments for this hour did not come back.</p>`
          }
        </article>
      </div>
      <section class="panel">
        <p class="kicker">The week</p>
        ${briefing.week ? `<p class="week-story">${esc(briefing.week)}</p>` : ""}
        <div class="days">
          ${days
            .map((d) => {
              const left = d.min == null ? 0 : ((d.min - weekMin) / span) * 100;
              const width = d.min == null || d.max == null ? 8 : Math.max(8, ((d.max - d.min) / span) * 100);
              const di = weatherInfo(d.code, 1);
              return `<div class="day">
                <span class="day-name">${esc(weekday(d.t, c.time, f.timezone))}</span>
                ${weatherIcon(di.kind, 1, 20, "wx-icon")}
                <span class="mono pop">${d.pop == null ? "—" : `${d.pop}%`}</span>
                <span class="mono amt">${d.precip == null ? "" : esc(fmtPrecip(d.precip, units))}</span>
                <span class="mono lo">${d.min == null ? "—" : `${Math.round(d.min)}°`}</span>
                <div class="bar"><span style="left:${left}%;width:${width}%"></span></div>
                <span class="mono hi">${d.max == null ? "—" : `${Math.round(d.max)}°`}</span>
                <span class="mono windy">${d.wind == null ? "" : `${Math.round(d.wind)}`}</span>
              </div>`;
            })
            .join("")}
        </div>
        <div class="moon-band">
          ${moonDisc(moon.illum, moon.t)}
          <div>
            <p class="place moon-name">${esc(moon.name)}</p>
            <p class="mono">${Math.round(moon.illum * 100)}% illuminated</p>
          </div>
        </div>
      </section>
      <footer class="footer">
        <p>Briefing is calculated here from the forecast.</p>
        <p>Updated ${esc(String(c.time).replace("T", " "))} · ${esc(f.timezone || "")} · ${bundle.source === "nws" ? "NWS (limited fields)" : "Open-Meteo"}</p>
        <p>Open-Meteo · IEM / NWS · RainViewer · OpenFreeMap / OSM</p>
      </footer>
    `;
  bindChrome();
  try { afterDashboardRender(); } catch (err) { console.warn(err); }
}

let searchTimer;
function debounceSearch(q) {
  clearTimeout(searchTimer);
  if (q.trim().length < 2) {
    state.hits = [];
    state.hitIndex = -1;
    patchHits();
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      state.hits = await searchPlaces(q.trim());
    } catch {
      state.hits = [];
    }
    state.hitIndex = state.hits.length ? 0 : -1;
    patchHits();
  }, 220);
}

function patchHits() {
  const box = document.querySelector(".search-box");
  const input = document.getElementById("q");
  if (!box) return;
  box.querySelector(".hits")?.remove();
  if (input) input.setAttribute("aria-expanded", String(state.hits.length > 0));
  if (!state.hits.length) return;
  const div = document.createElement("div");
  div.className = "hits";
  div.id = "hits";
  div.setAttribute("role", "listbox");
  div.innerHTML = state.hits
    .map(
      (h, i) =>
        `<button type="button" role="option" data-pick="${esc(h.id)}" class="${i === state.hitIndex ? "on" : ""}"><span>${esc(h.name)}</span><small>${esc(h.detail)}</small></button>`,
    )
    .join("");
  box.appendChild(div);
  div.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const hit = state.hits.find((h) => h.id === btn.getAttribute("data-pick"));
      if (hit) pickPlace(hit);
    });
  });
}

function bindArc() {
  const wrap = document.getElementById("arc-wrap");
  const tip = document.getElementById("arc-tip");
  const svg = wrap?.querySelector("svg");
  if (!wrap || !tip || !svg || !arcModel?.count) return;
  const showIndex = (index, anchor) => {
    const hour = arcModel.hours[index];
    if (!hour) return;
    tip.hidden = false;
    tip.textContent = hour.detail;
    const rect = wrap.getBoundingClientRect();
    let center = anchor == null
      ? ((index + 0.5) / arcModel.count) * rect.width
      : anchor - rect.left;
    tip.style.transform = "translateX(-50%)";
    tip.style.left = "0px";
    const tipWidth = tip.offsetWidth;
    if (tipWidth >= rect.width - 8) {
      tip.style.left = "4px";
      tip.style.transform = "none";
      return;
    }
    const half = tipWidth / 2;
    center = Math.max(half + 4, Math.min(rect.width - half - 4, center));
    tip.style.left = `${center}px`;
  };
  const indexAt = (clientX) => {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const ctm = svg.getScreenCTM();
    if (!ctm) return 0;
    const local = pt.matrixTransform(ctm.inverse());
    const { count, width, pad } = arcModel;
    const col = (width - pad * 2) / count;
    return Math.max(0, Math.min(count - 1, Math.floor((local.x - pad) / col)));
  };
  let cursor = 0;
  const point = (clientX) => {
    cursor = indexAt(clientX);
    showIndex(cursor, clientX);
  };
  wrap.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" && e.buttons === 0) return;
    point(e.clientX);
  });
  wrap.addEventListener("pointerdown", (e) => {
    point(e.clientX);
  });
  wrap.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    tip.hidden = true;
  });
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    cursor = Math.max(0, Math.min(arcModel.count - 1, cursor + (e.key === "ArrowRight" ? 1 : -1)));
    showIndex(cursor, null);
  });
  wrap.addEventListener("focus", () => {
    showIndex(cursor, null);
  });
  wrap.addEventListener("blur", () => {
    tip.hidden = true;
  });
}

let resizeTimer = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (arcKey() === lastArcKey) return;
    render();
  }, 150);
});

function bindChrome() {
  const q = document.getElementById("q");
  if (q) {
    q.addEventListener("input", () => {
      state.q = q.value;
      debounceSearch(q.value);
    });
    q.addEventListener("keydown", (e) => {
      if (!state.hits.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        state.hitIndex = (state.hitIndex + 1) % state.hits.length;
        patchHits();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        state.hitIndex = (state.hitIndex - 1 + state.hits.length) % state.hits.length;
        patchHits();
      } else if (e.key === "Enter" && state.hitIndex >= 0) {
        e.preventDefault();
        pickPlace(state.hits[state.hitIndex]);
      } else if (e.key === "Escape") {
        state.hits = [];
        state.hitIndex = -1;
        patchHits();
      }
    });
  }
  document.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const hit = state.hits.find((h) => h.id === btn.getAttribute("data-pick"));
      if (hit) pickPlace(hit);
    });
  });
  document.querySelectorAll("[data-units]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.units = btn.getAttribute("data-units");
      persist();
      window.dispatchEvent(new CustomEvent("aether:refresh"));
    });
  });
  document.querySelectorAll("[data-saved]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = state.saved.find((s) => s.id === btn.getAttribute("data-saved"));
      if (p) {
        state.locateSeq += 1;
        state.place = p;
        state.placeSource = "search";
        persist();
        window.dispatchEvent(new CustomEvent("aether:refresh"));
      }
    });
  });
  document.getElementById("star")?.addEventListener("click", () => {
    const exists = state.saved.some((s) => s.id === state.place.id);
    state.saved = exists ? state.saved.filter((s) => s.id !== state.place.id) : [...state.saved, state.place].slice(-8);
    persist();
    render();
  });
  document.getElementById("locate")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("aether:locate"));
  });
  document.getElementById("retry")?.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("aether:refresh"));
  });
  document.querySelectorAll("[data-alert]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-alert");
      state.alertOpen = state.alertOpen === id ? null : id;
      render();
    });
  });
  bindArc();
}

function pickPlace(hit) {
  state.locateSeq += 1;
  state.place = hit;
  state.placeSource = "search";
  state.q = "";
  state.hits = [];
  state.hitIndex = -1;
  persist();
  window.dispatchEvent(new CustomEvent("aether:refresh"));
}
