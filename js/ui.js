import { weatherIcon, moonDisc } from "./icons.js";
import { afterDashboardRender, parkRadar } from "./radar.js";
import { persist, state } from "./state.js";
import {
  aqiBand,
  alertTone,
  cardinal,
  esc,
  fmtClock,
  fmtLong,
  fmtPrecip,
  fmtPressure,
  fmtVis,
  fmtWhen,
  hourIndex,
  locateIcon,
  minutesOf,
  moonPhase,
  rainTiming,
  searchIcon,
  starIcon,
  timeOfDay,
  uvBand,
  weatherInfo,
  weekday,
} from "./util.js";
import { searchPlaces } from "./weather.js";

function applySky(kind, tod) {
  const sky = document.getElementById("sky");
  if (!sky) return;
  sky.dataset.kind = kind || "clear";
  sky.dataset.tod = tod || "day";
}

function meter(v, max, cls = "") {
  if (v == null || Number.isNaN(v)) return `<div class="meter ${cls}"></div>`;
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return `<div class="meter ${cls}"><span style="width:${pct}%"></span></div>`;
}

function windRose(speed, gust, dir, units) {
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
  return `<article class="panel">
      <div class="row-split">
        <p class="kicker">Wind</p><p class="mono">${dir == null ? "" : `from ${cardinal(deg)}`}</p>
      </div>
      <div class="wind-wrap">
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" stroke-opacity="0.1"/>
          ${ticks}${labels}
          <g transform="rotate(${deg} 100 100)">
            <polygon points="100,22 108,58 92,58" fill="#c5cdd8"/>
            <line x1="100" y1="58" x2="100" y2="108" stroke="#c5cdd8" stroke-width="2"/>
            <circle cx="100" cy="112" r="3" fill="#c5cdd8"/>
          </g>
        </svg>
        <div class="center"><p class="stat" style="margin:0">${spd}</p><p class="mono">${units === "imperial" ? "mph" : "km/h"}</p></div>
      </div>
      <p class="detail" style="text-align:center">Gusts ${gst} ${units === "imperial" ? "mph" : "km/h"}</p>
    </article>`;
}

function sunPath(sunrise, sunset, nowIso) {
  if (!sunrise || !sunset) {
    return `<p class="detail">Sun times unavailable from this source.</p>`;
  }
  const rise = minutesOf(sunrise);
  const set = minutesOf(sunset);
  const now = minutesOf(nowIso);
  const span = Math.max(1, set - rise);
  let t = 0.5;
  let up = false;
  if (now != null) {
    up = now >= rise && now <= set;
    t = up ? (now - rise) / span : now < rise ? 0 : 1;
  }
  const w = 320;
  const h = 110;
  const p0 = [24, 88];
  const p1 = [w / 2, 14];
  const p2 = [w - 24, 88];
  const bez = (u) => {
    const mt = 1 - u;
    return [
      mt * mt * p0[0] + 2 * mt * u * p1[0] + u * u * p2[0],
      mt * mt * p0[1] + 2 * mt * u * p1[1] + u * u * p2[1],
    ];
  };
  const [sx, sy] = bez(t);
  const d = `M ${p0[0]} ${p0[1]} Q ${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
  return `<svg class="sun-path" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="rgb(236 238 242 / 0.16)" stroke-width="2"/>
    <circle cx="${sx}" cy="${sy}" r="6" fill="${up ? "#e8c37a" : "#8b909a"}"/>
  </svg>
  <p class="sun-times"><span>${esc(fmtClock(sunrise))}</span><span>${esc(fmtClock(sunset))}</span></p>`;
}

function chart(forecast) {
  const start = hourIndex(forecast.hourly.time, forecast.current.time);
  const slice = forecast.hourly.time.slice(start, start + 36);
  if (!slice.length) return "";
  const temps = slice.map((_, i) => forecast.hourly.temperature_2m[start + i]);
  const pops = slice.map((_, i) => forecast.hourly.precipitation_probability[start + i] || 0);
  const min = Math.min(...temps.filter((n) => n != null)) - 2;
  const max = Math.max(...temps.filter((n) => n != null)) + 2;
  const w = 640;
  const h = 176;
  const pad = { l: 8, r: 8, t: 18, b: 28 };
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, slice.length - 1);
  const y = (t) => pad.t + ((max - t) / Math.max(1, max - min)) * (h - pad.t - pad.b);
  const line = temps.map((t, i) => `${i ? "L" : "M"}${x(i)},${y(t ?? min)}`).join(" ");
  const area = `${line} L${x(temps.length - 1)},${h - pad.b} L${x(0)},${h - pad.b} Z`;
  const bars = pops
    .map((p, i) => {
      const bh = (p / 100) * (h - pad.t - pad.b);
      return `<rect x="${x(i) - 3}" y="${h - pad.b - bh}" width="6" height="${bh}" fill="rgb(91 159 214 / 0.35)" rx="2"/>`;
    })
    .join("");
  const ticks = slice
    .map((iso, i) => {
      if (i % 6 !== 0) return "";
      return `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" fill="#6a6f79" font-size="11" font-family="IBM Plex Mono, monospace">${i === 0 ? "Now" : fmtHourSafe(iso)}</text>`;
    })
    .join("");
  return `<div class="chart-wrap" id="chart-wrap" data-start="${start}">
    <svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${bars}<path d="${area}" fill="rgb(197 205 216 / 0.14)"/><path d="${line}" fill="none" stroke="#c5cdd8" stroke-width="2"/>${ticks}</svg>
    <div class="chart-tip" id="chart-tip" hidden></div>
  </div>`;
}

function fmtHourSafe(iso) {
  const h = Number(String(iso).slice(11, 13));
  const d = new Date(2000, 0, 1, h);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(d);
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
      <p class="lede">Immersive radar and a living forecast.</p>
    </header>
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
      const tone = alertTone(a.severity);
      return `<article class="alert tone-${tone}">
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

export function render() {
  const root = document.getElementById("app");
  parkRadar();
  const { place, units, loading, error, bundle } = state;
  const header = chromeHeader();

  if (loading && !bundle) {
    root.innerHTML =
      header +
      `<div class="grid-hero"><div class="spin" style="height:16rem"></div>${radarSlot()}</div><div class="metrics">${"<div class='spin' style='height:9rem'></div>".repeat(4)}</div>`;
    bindChrome();
    try { afterDashboardRender(); } catch (err) { console.warn(err); }
    return;
  }
  if ((error || !bundle) && !bundle) {
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
  const idx = hourIndex(f.hourly.time, c.time);
  const uv = c.uv_index ?? f.hourly.uv_index?.[idx];
  const dew = c.dew_point_2m ?? f.hourly.dew_point_2m?.[idx];
  const vis = c.visibility ?? f.hourly.visibility?.[idx];
  const prevP = f.hourly.pressure_msl?.[Math.max(0, idx - 3)];
  const delta = c.pressure_msl != null && prevP != null ? c.pressure_msl - prevP : 0;
  const hours = f.hourly.time.slice(idx, idx + 24);
  const days = f.daily.time.map((t, i) => ({
    t,
    code: f.daily.weather_code[i],
    max: f.daily.temperature_2m_max[i],
    min: f.daily.temperature_2m_min[i],
    pop: f.daily.precipitation_probability_max[i],
    precip: f.daily.precipitation_sum?.[i],
    wind: f.daily.wind_speed_10m_max?.[i],
  }));
  const weekMin = Math.min(...days.map((d) => d.min));
  const weekMax = Math.max(...days.map((d) => d.max));
  const span = Math.max(1, weekMax - weekMin);
  const moon = moonPhase(new Date());
  const aqi = bundle.air?.usAqi;
  const aqiMeta = aqiBand(aqi);
  const uvMeta = uvBand(uv);
  const tod = timeOfDay(c.time, f.daily.sunrise?.[0], f.daily.sunset?.[0], c.is_day);
  const timing = rainTiming(f.hourly, idx, units);
  const hourPrecip = f.hourly.precipitation?.[idx];
  const todayPrecip = f.daily.precipitation_sum?.[0];
  applySky(info.kind, tod);

  const pressure = fmtPressure(c.pressure_msl, units);
  const visibility = fmtVis(vis, units);

  root.innerHTML = header + `
      ${alertsHtml(bundle.alerts, f.timezone)}
      <div class="grid-hero">
        <article class="panel hero">
          <p class="kicker">${esc(fmtLong(c.time, f.timezone))}</p>
          <h1 class="place">${esc(place.name)}</h1>
          <p class="detail">${esc(place.detail)}</p>
          <div class="hero-row">
            <p class="temp">${Math.round(c.temperature_2m)}°</p>
            <div class="cond">
              ${weatherIcon(info.kind, c.is_day, 40, "wx-icon hero-wx")}
              <p>${esc(info.label)}</p>
              <p class="muted">Feels ${Math.round(c.apparent_temperature)}°</p>
              <p class="mono">H ${Math.round(f.daily.temperature_2m_max[0])}° / L ${Math.round(f.daily.temperature_2m_min[0])}°</p>
            </div>
          </div>
          <p class="timing">${esc(timing)}</p>
        </article>
        ${radarSlot()}
      </div>
      <div class="grid-inst">
        ${windRose(c.wind_speed_10m, c.wind_gusts_10m, c.wind_direction_10m, units)}
        <div class="metrics">
          <article class="panel"><p class="kicker">UV index</p><p class="stat">${uv == null ? "—" : Math.round(uv)}</p><p class="detail">${uvMeta.label}</p>${meter(uv, 12, uvMeta.cls)}</article>
          <article class="panel"><p class="kicker">Humidity</p><p class="stat">${c.relative_humidity_2m == null ? "—" : `${Math.round(c.relative_humidity_2m)}%`}</p><p class="detail">Dew ${dew == null ? "—" : `${Math.round(dew)}°`}</p>${meter(c.relative_humidity_2m, 100)}</article>
          <article class="panel"><p class="kicker">Pressure</p><p class="stat">${esc(pressure.value)}</p><p class="detail">${esc(pressure.unit)}${c.pressure_msl == null ? "" : Math.abs(delta) >= 0.4 ? (delta > 0 ? " · rising" : " · falling") : " · steady"}</p>${meter(c.pressure_msl == null ? null : ((c.pressure_msl - 980) / 50) * 100, 100)}</article>
          <article class="panel"><p class="kicker">Visibility</p><p class="stat">${esc(visibility.value)}</p><p class="detail">${esc(visibility.unit)}${c.cloud_cover == null ? "" : ` · ${Math.round(c.cloud_cover)}% cloud`}</p>${meter(c.cloud_cover, 100)}</article>
          <article class="panel span-2">
            <p class="kicker">Air quality</p>
            ${
              aqi == null
                ? `<p class="detail">Air quality is unavailable for this hour.</p>`
                : `<p class="stat">${Math.round(aqi)}</p><p class="detail">${aqiMeta.label}</p>${meter(aqi, 200, aqiMeta.cls)}
                   <p class="mono pollutants">${[
                     bundle.air?.pm25 != null ? `PM2.5 ${Math.round(bundle.air.pm25)}` : null,
                     bundle.air?.ozone != null ? `O₃ ${Math.round(bundle.air.ozone)}` : null,
                     bundle.air?.no2 != null ? `NO₂ ${Math.round(bundle.air.no2)}` : null,
                   ]
                     .filter(Boolean)
                     .join(" · ")}</p>`
            }
          </article>
          <article class="panel span-2">
            <p class="kicker">Precipitation</p>
            <p class="stat">${Math.round(f.hourly.precipitation_probability?.[idx] || 0)}%</p>
            <p class="detail">Chance this hour${hourPrecip != null ? ` · ${fmtPrecip(hourPrecip, units)}` : ""}${todayPrecip != null ? ` · today ${fmtPrecip(todayPrecip, units)}` : ""}</p>
            ${meter(f.hourly.precipitation_probability?.[idx] || 0, 100, "precip")}
          </article>
        </div>
      </div>
      <section class="panel">
        <p class="kicker">Next 24 hours</p>
        <div class="hours" style="margin-top:1rem">
          ${hours
            .map((t, i) => {
              const code = f.hourly.weather_code?.[idx + i];
              const hi = weatherInfo(code, f.hourly.is_day?.[idx + i]);
              return `<div class="hour"><span class="mono">${i === 0 ? "Now" : fmtHourSafe(t)}</span>${weatherIcon(hi.kind, f.hourly.is_day?.[idx + i], 22, "wx-icon")}<b>${Math.round(f.hourly.temperature_2m[idx + i])}°</b><span class="mono">${f.hourly.precipitation_probability?.[idx + i] || 0}%</span></div>`;
            })
            .join("")}
        </div>
      </section>
      <section class="panel">
        <p class="kicker">Temperature and chance of precip</p>
        <div style="margin-top:1rem">${chart(f)}</div>
      </section>
      <div class="grid-low">
        <section class="panel">
          <p class="kicker">10-day</p>
          ${days
            .map((d) => {
              const left = ((d.min - weekMin) / span) * 100;
              const width = Math.max(8, ((d.max - d.min) / span) * 100);
              const di = weatherInfo(d.code, 1);
              return `<div class="day">
                <span class="day-name">${esc(weekday(d.t, c.time, f.timezone))}</span>
                ${weatherIcon(di.kind, 1, 20, "wx-icon")}
                <span class="mono pop">${d.pop == null ? "—" : `${d.pop}%`}</span>
                <span class="mono amt">${d.precip == null ? "" : esc(fmtPrecip(d.precip, units))}</span>
                <span class="mono" style="width:2rem;text-align:right">${Math.round(d.min)}°</span>
                <div class="bar"><span style="left:${left}%;width:${width}%"></span></div>
                <span class="mono" style="width:2rem">${Math.round(d.max)}°</span>
                <span class="mono windy">${d.wind == null ? "" : `${Math.round(d.wind)}`}</span>
              </div>`;
            })
            .join("")}
        </section>
        <div class="side-stack">
          <section class="panel">
            <p class="kicker">Sun path</p>
            ${sunPath(f.daily.sunrise?.[0], f.daily.sunset?.[0], c.time)}
          </section>
          <section class="panel moon-panel">
            <p class="kicker">Moon</p>
            <div class="moon-row">
              ${moonDisc(moon.illum, moon.t)}
              <div>
                <p class="place moon-name">${esc(moon.name)}</p>
                <p class="mono">${Math.round(moon.illum * 100)}% illuminated</p>
              </div>
            </div>
          </section>
        </div>
      </div>
      <footer class="footer">
        <p>Updated ${esc(c.time.replace("T", " "))} · ${esc(f.timezone)} · ${bundle.source === "nws" ? "NWS (limited fields)" : "Open-Meteo"}</p>
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

function bindChart() {
  const wrap = document.getElementById("chart-wrap");
  const tip = document.getElementById("chart-tip");
  const f = state.bundle?.forecast;
  if (!wrap || !tip || !f) return;
  const start = Number(wrap.dataset.start);
  wrap.addEventListener("mousemove", (e) => {
    const rect = wrap.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const i = Math.round(t * 35);
    const iso = f.hourly.time[start + i];
    if (!iso) return;
    tip.hidden = false;
    tip.style.left = `${t * 100}%`;
    const temp = Math.round(f.hourly.temperature_2m[start + i]);
    const pop = f.hourly.precipitation_probability[start + i] || 0;
    tip.textContent = `${i === 0 ? "Now" : fmtHourSafe(iso)} · ${temp}° · ${pop}%`;
  });
  wrap.addEventListener("mouseleave", () => {
    tip.hidden = true;
  });
}

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
        state.place = p;
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
  bindChart();
}

function pickPlace(hit) {
  state.place = hit;
  state.q = "";
  state.hits = [];
  state.hitIndex = -1;
  persist();
  window.dispatchEvent(new CustomEvent("aether:refresh"));
}
