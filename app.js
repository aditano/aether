(() => {
  const DEFAULT_PLACE = {
    id: "radnor-pa",
    name: "Radnor",
    detail: "Pennsylvania, United States",
    lat: 40.0462,
    lon: -75.3599,
  };
  const CARD = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const STORE_KEY = "aether-v1";

  const state = {
    units: "imperial",
    place: DEFAULT_PLACE,
    saved: [],
    q: "",
    hits: [],
    locating: false,
    playing: true,
    frame: 0,
    mode: "radar",
    bundle: null,
    error: null,
    loading: true,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved?.place) state.place = saved.place;
    if (saved?.units) state.units = saved.units;
    if (Array.isArray(saved?.saved)) state.saved = saved.saved;
  } catch {}

  function persist() {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ units: state.units, place: state.place, saved: state.saved }),
    );
  }

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;" }[c]));

  const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>`;
  const locateIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
  const starIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3l2.6 6.4L21 10l-4.5 4.2L17.8 21 12 17.8 6.2 21l1.3-6.8L3 10l6.4-.6z"/></svg>`;

  function weatherInfo(code, isDay) {
    if (code === 0) return { label: "Clear", kind: "clear" };
    if (code === 1) return { label: "Mostly clear", kind: "clear" };
    if (code === 2) return { label: "Partly cloudy", kind: "cloud" };
    if (code === 3) return { label: "Overcast", kind: "cloud" };
    if (code === 45 || code === 48) return { label: "Fog", kind: "fog" };
    if (code >= 51 && code <= 57) return { label: "Drizzle", kind: "rain" };
    if (code >= 61 && code <= 67) return { label: "Rain", kind: "rain" };
    if (code >= 71 && code <= 77) return { label: "Snow", kind: "snow" };
    if (code >= 80 && code <= 82) return { label: "Showers", kind: "rain" };
    if (code >= 85 && code <= 86) return { label: "Snow showers", kind: "snow" };
    if (code >= 95) return { label: "Thunderstorm", kind: "storm" };
    return { label: "Fair", kind: "clear" };
  }
  function cardinal(deg) { return CARD[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]; }
  function uvBand(uv) {
    if (uv <= 2) return "Low";
    if (uv <= 5) return "Moderate";
    if (uv <= 7) return "High";
    if (uv <= 10) return "Very high";
    return "Extreme";
  }
  function aqiBand(v) {
    if (v <= 50) return "Good";
    if (v <= 100) return "Moderate";
    if (v <= 150) return "Unhealthy for sensitive groups";
    if (v <= 200) return "Unhealthy";
    if (v <= 300) return "Very unhealthy";
    return "Hazardous";
  }

  function isNaive(iso) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) && !/Z$|[+-]\d\d:\d\d$/.test(iso); }
  function fmtHour(iso) {
    const h = Number(iso.slice(11, 13));
    const d = new Date(2000, 0, 1, h);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(d);
  }
  function fmtClock(iso) {
    const [h, m] = iso.slice(11, 16).split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m || 0);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  }
  function fmtLong(iso, tz) {
    const d = isNaive(iso) ? new Date(iso.slice(0, 10) + "T12:00:00") : new Date(iso);
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d);
  }
  function weekday(iso, nowIso, tz) {
    const day = iso.slice(0, 10);
    const today = nowIso.slice(0, 10);
    if (day === today) return "Today";
    const [y, m, d] = today.split("-").map(Number);
    const tmr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    if (day === tmr) return "Tomorrow";
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(day + "T12:00:00"));
  }
  function hourIndex(times, current) {
    const key = current.slice(0, 13);
    const i = times.findIndex((t) => t.slice(0, 13) >= key);
    return i < 0 ? 0 : i;
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  function fmtPressure(hpa, units) { return units === "imperial" ? `${r1(hpa * 0.02953)} inHg` : `${Math.round(hpa)} hPa`; }
  function fmtVis(v, units) {
    if (units === "imperial") {
      const mi = v / 5280;
      return mi >= 10 ? `${Math.round(mi)} mi` : mi >= 1 ? `${r1(mi)} mi` : `${Math.round(v)} ft`;
    }
    const km = v / 1000;
    return km >= 10 ? `${Math.round(km)} km` : km >= 1 ? `${r1(km)} km` : `${Math.round(v)} m`;
  }
  function moonPhase(date) {
    const SYN = 29.53058867;
    const known = Date.UTC(2000, 0, 6, 18, 14, 0);
    const days = (date.getTime() - known) / 86400000;
    const age = ((days % SYN) + SYN) % SYN;
    const illum = (1 - Math.cos((2 * Math.PI * age) / SYN)) / 2;
    const t = age / SYN;
    let name = "New moon";
    if (t > 0.03 && t < 0.22) name = "Waxing crescent";
    else if (t < 0.28) name = "First quarter";
    else if (t < 0.47) name = "Waxing gibbous";
    else if (t < 0.53) name = "Full moon";
    else if (t < 0.72) name = "Waning gibbous";
    else if (t < 0.78) name = "Last quarter";
    else if (t < 0.97) name = "Waning crescent";
    return { name, illum };
  }

  async function getJson(url, headers) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("fail " + res.status);
    return res.json();
  }

  async function searchPlaces(q) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", q);
    url.searchParams.set("count", "6");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const json = await getJson(url);
    return (json.results || []).map((r) => ({
      id: String(r.id),
      name: r.name,
      detail: [r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lon: r.longitude,
    }));
  }

  async function reversePlace(lat, lon) {
    try {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
      url.searchParams.set("latitude", lat.toFixed(4));
      url.searchParams.set("longitude", lon.toFixed(4));
      url.searchParams.set("language", "en");
      url.searchParams.set("format", "json");
      const json = await getJson(url);
      const r = json.results?.[0];
      if (r) return { id: String(r.id), name: r.name, detail: [r.admin1, r.country].filter(Boolean).join(", "), lat, lon };
    } catch {}
    return { id: `${lat.toFixed(3)},${lon.toFixed(3)}`, name: "My location", detail: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`, lat, lon };
  }

  const CURRENT = "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,uv_index,dew_point_2m";
  const HOURLY = "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,pressure_msl";
  const DAILY = "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunshine_duration";

  async function fetchOpenMeteo(lat, lon, units) {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lon);
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "10");
    url.searchParams.set("current", CURRENT);
    url.searchParams.set("hourly", HOURLY);
    url.searchParams.set("daily", DAILY);
    url.searchParams.set("temperature_unit", units === "metric" ? "celsius" : "fahrenheit");
    url.searchParams.set("wind_speed_unit", units === "metric" ? "kmh" : "mph");
    url.searchParams.set("precipitation_unit", units === "metric" ? "mm" : "inch");
    const raw = await getJson(url);
    return { timezone: raw.timezone, current: raw.current, hourly: raw.hourly, daily: raw.daily };
  }

  function codeFromText(text) {
    const t = (text || "").toLowerCase();
    if (t.includes("thunder")) return 95;
    if (t.includes("snow") || t.includes("sleet")) return 71;
    if (t.includes("fog")) return 45;
    if (t.includes("rain") || t.includes("shower")) return 61;
    if (t.includes("overcast") || t === "cloudy") return 3;
    if (t.includes("partly")) return 2;
    if (t.includes("clear") || t.includes("sunny")) return 0;
    return 2;
  }
  function parseWind(text, units) {
    const nums = (text || "").match(/[\d.]+/g)?.map(Number) || [];
    if (!nums.length) return 0;
    const mph = nums.length === 1 ? nums[0] : (nums[0] + nums[1]) / 2;
    return units === "imperial" ? mph : mph * 1.60934;
  }
  function dirToDeg(dir) {
    if (typeof dir === "number") return dir;
    const i = CARD.indexOf(String(dir || "").toUpperCase());
    return i >= 0 ? i * 22.5 : 0;
  }
  function localStamp(iso, tz) {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d);
    const g = (t) => parts.find((p) => p.type === t)?.value || "00";
    return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
  }
  function qty(v) { return v && typeof v.value === "number" ? v.value : null; }
  const toF = (c) => (c * 9) / 5 + 32;
  const toC = (f) => ((f - 32) * 5) / 9;

  async function fetchNws(lat, lon, units) {
    const points = await getJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { Accept: "application/geo+json" });
    const tz = points.properties.timeZone;
    const [hourlyJ, dailyJ, stationsJ] = await Promise.all([
      getJson(points.properties.forecastHourly, { Accept: "application/geo+json" }),
      getJson(points.properties.forecast, { Accept: "application/geo+json" }),
      getJson(points.properties.observationStations, { Accept: "application/geo+json" }),
    ]);
    const sid = stationsJ.features[0]?.properties.stationIdentifier;
    let obs = null;
    if (sid) {
      try { obs = (await getJson(`https://api.weather.gov/stations/${sid}/observations/latest`, { Accept: "application/geo+json" })).properties; } catch {}
    }
    const conv = (v, from) => {
      const c = from === "C" ? v : toC(v);
      return units === "imperial" ? toF(c) : c;
    };
    const periods = hourlyJ.properties.periods.slice(0, 48);
    const hourly = { time: [], temperature_2m: [], relative_humidity_2m: [], dew_point_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], cloud_cover: [], visibility: [], wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [], uv_index: [], is_day: [], pressure_msl: [] };
    const visM = qty(obs?.visibility);
    const humidity = qty(obs?.relativeHumidity) || 0;
    const pressure = qty(obs?.barometricPressure);
    for (const p of periods) {
      const from = p.temperatureUnit === "C" ? "C" : "F";
      hourly.time.push(localStamp(p.startTime, tz));
      hourly.temperature_2m.push(conv(p.temperature, from));
      hourly.relative_humidity_2m.push(p.relativeHumidity?.value ?? humidity);
      hourly.dew_point_2m.push(p.dewpoint?.value != null ? conv(p.dewpoint.value, "C") : conv(p.temperature, from));
      hourly.apparent_temperature.push(conv(p.temperature, from));
      hourly.precipitation_probability.push(p.probabilityOfPrecipitation?.value ?? 0);
      hourly.precipitation.push(0);
      hourly.weather_code.push(codeFromText(p.shortForecast));
      hourly.cloud_cover.push(50);
      hourly.visibility.push(visM == null ? 16000 : units === "imperial" ? visM * 3.28084 : visM);
      hourly.wind_speed_10m.push(parseWind(p.windSpeed, units));
      hourly.wind_direction_10m.push(dirToDeg(p.windDirection));
      hourly.wind_gusts_10m.push(parseWind(p.windSpeed, units));
      hourly.uv_index.push(0);
      hourly.is_day.push(/\/day\//.test(p.icon || "") ? 1 : 0);
      hourly.pressure_msl.push(pressure != null ? pressure / 100 : 1013);
    }
    const days = new Map();
    for (const p of dailyJ.properties.periods) {
      const day = localStamp(p.startTime, tz).slice(0, 10);
      const from = p.temperatureUnit === "C" ? "C" : "F";
      const temp = conv(p.temperature, from);
      const cur = days.get(day) || { max: temp, min: temp, code: codeFromText(p.shortForecast), pop: p.probabilityOfPrecipitation?.value ?? 0 };
      if (p.isDaytime) { cur.max = Math.max(cur.max, temp); cur.code = codeFromText(p.shortForecast); }
      else cur.min = Math.min(cur.min, temp);
      cur.pop = Math.max(cur.pop, p.probabilityOfPrecipitation?.value ?? 0);
      days.set(day, cur);
    }
    const keys = [...days.keys()].slice(0, 10);
    const daily = { time: keys, weather_code: [], temperature_2m_max: [], temperature_2m_min: [], sunrise: [], sunset: [], uv_index_max: [], precipitation_sum: [], precipitation_probability_max: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], wind_direction_10m_dominant: [], sunshine_duration: [] };
    for (const k of keys) {
      const d = days.get(k);
      daily.weather_code.push(d.code);
      daily.temperature_2m_max.push(d.max);
      daily.temperature_2m_min.push(d.min);
      daily.sunrise.push(k + "T06:30");
      daily.sunset.push(k + "T19:30");
      daily.uv_index_max.push(0);
      daily.precipitation_sum.push(0);
      daily.precipitation_probability_max.push(d.pop);
      daily.wind_speed_10m_max.push(0);
      daily.wind_gusts_10m_max.push(0);
      daily.wind_direction_10m_dominant.push(0);
      daily.sunshine_duration.push(0);
    }
    const tempC = qty(obs?.temperature);
    const appC = qty(obs?.heatIndex) ?? qty(obs?.windChill) ?? tempC;
    const dewC = qty(obs?.dewpoint);
    const windKmh = qty(obs?.windSpeed) || 0;
    return {
      timezone: tz,
      current: {
        time: localStamp(obs?.timestamp || periods[0].startTime, tz),
        temperature_2m: tempC != null ? conv(tempC, "C") : hourly.temperature_2m[0],
        relative_humidity_2m: humidity,
        apparent_temperature: appC != null ? conv(appC, "C") : hourly.apparent_temperature[0],
        is_day: 1,
        precipitation: 0,
        weather_code: codeFromText(obs?.textDescription || periods[0]?.shortForecast),
        cloud_cover: 40,
        pressure_msl: pressure != null ? pressure / 100 : 1013,
        wind_speed_10m: units === "imperial" ? windKmh * 0.621371 : windKmh,
        wind_direction_10m: dirToDeg(qty(obs?.windDirection)),
        wind_gusts_10m: units === "imperial" ? (qty(obs?.windGust) || windKmh) * 0.621371 : (qty(obs?.windGust) || windKmh),
        visibility: visM == null ? null : units === "imperial" ? visM * 3.28084 : visM,
        uv_index: null,
        dew_point_2m: dewC != null ? conv(dewC, "C") : null,
      },
      hourly,
      daily,
    };
  }

  async function loadWeather(lat, lon, units) {
    const tasks = [
      fetchOpenMeteo(lat, lon, units).then((forecast) => ({ forecast, source: "open-meteo" })).catch(() =>
        fetchNws(lat, lon, units).then((forecast) => ({ forecast, source: "nws" })),
      ),
      getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto`).then((j) => j.current ? { usAqi: j.current.us_aqi, pm25: j.current.pm2_5, ozone: j.current.ozone, no2: j.current.nitrogen_dioxide } : null).catch(() => null),
      getJson("https://api.rainviewer.com/public/weather-maps.json").then((j) => ({ host: j.host, radar: [...(j.radar?.past || []), ...(j.radar?.nowcast || [])], satellite: j.satellite?.infrared || [] })).catch(() => null),
      getJson(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, { Accept: "application/geo+json" }).then((j) => (j.features || []).slice(0, 5).map((f, i) => ({ id: f.id || i, event: f.properties?.event || "Alert", headline: f.properties?.headline || f.properties?.event }))).catch(() => []),
    ];
    const [wx, air, radar, alerts] = await Promise.all(tasks);
    return { ...wx, air, radar, alerts };
  }

  let map, overlay, playTimer;
  function destroyMap() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    if (map) { map.remove(); map = null; overlay = null; }
  }
  function mountRadar() {
    const el = document.getElementById("radar-map");
    const radar = state.bundle?.radar;
    if (!el || !window.L) return;
    destroyMap();
    map = L.map(el, { zoomControl: false, attributionControl: true }).setView([state.place.lat, state.place.lon], 7);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OSM &copy; CARTO · Radar RainViewer",
      maxZoom: 18, subdomains: "abcd",
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.circleMarker([state.place.lat, state.place.lon], { radius: 6, color: "#c5cdd8", weight: 2, fillColor: "#eceef2", fillOpacity: 0.95 }).addTo(map);
    const list = state.mode === "radar" ? radar?.radar || [] : radar?.satellite || [];
    if (!list.length) return;
    if (state.frame >= list.length) state.frame = list.length - 1;
    const apply = () => {
      const f = list[state.frame];
      if (!f || !radar) return;
      const url = `${radar.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`;
      const layer = L.tileLayer(url, { opacity: 0.72, zIndex: 10 });
      layer.addTo(map);
      if (overlay) overlay.remove();
      overlay = layer;
      const stamp = document.getElementById("radar-stamp");
      if (stamp) stamp.textContent = new Date(f.time * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: state.bundle.forecast.timezone });
      const slider = document.getElementById("radar-slider");
      if (slider) slider.value = String(state.frame);
    };
    apply();
    if (state.playing && list.length > 1) {
      playTimer = setInterval(() => {
        state.frame = (state.frame + 1) % list.length;
        apply();
      }, 420);
    }
  }

  function meter(v, max) {
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    return `<div class="meter"><span style="width:${pct}%"></span></div>`;
  }

  function windRose(speed, gust, dir, units) {
    const ticks = Array.from({ length: 36 }, (_, i) => i * 10).map((deg) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      const inner = deg % 90 === 0 ? 70 : deg % 30 === 0 ? 76 : 80;
      return `<line x1="${100 + inner * Math.cos(rad)}" y1="${100 + inner * Math.sin(rad)}" x2="${100 + 86 * Math.cos(rad)}" y2="${100 + 86 * Math.sin(rad)}" stroke="currentColor" stroke-opacity="${deg % 90 === 0 ? 0.55 : 0.18}" stroke-width="${deg % 90 === 0 ? 1.5 : 1}"/>`;
    }).join("");
    const labels = ["N", "E", "S", "W"].map((lab, i) => {
      const rad = ((i * 90 - 90) * Math.PI) / 180;
      return `<text x="${100 + 96 * Math.cos(rad)}" y="${100 + 96 * Math.sin(rad)}" text-anchor="middle" dominant-baseline="middle" fill="#8b909a" font-size="10">${lab}</text>`;
    }).join("");
    return `<article class="panel">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <p class="kicker">Wind</p><p class="mono">from ${cardinal(dir)}</p>
      </div>
      <div class="wind-wrap">
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" stroke-opacity="0.1"/>
          ${ticks}${labels}
          <g transform="rotate(${dir} 100 100)">
            <polygon points="100,22 108,58 92,58" fill="#c5cdd8"/>
            <line x1="100" y1="58" x2="100" y2="108" stroke="#c5cdd8" stroke-width="2"/>
            <circle cx="100" cy="112" r="3" fill="#c5cdd8"/>
          </g>
        </svg>
        <div class="center"><p class="stat" style="margin:0">${Math.round(speed)}</p><p class="mono">${units === "imperial" ? "mph" : "km/h"}</p></div>
      </div>
      <p class="detail" style="text-align:center">Gusts ${Math.round(gust)} ${units === "imperial" ? "mph" : "km/h"}</p>
    </article>`;
  }

  function chart(forecast) {
    const start = hourIndex(forecast.hourly.time, forecast.current.time);
    const slice = forecast.hourly.time.slice(start, start + 36);
    const temps = slice.map((_, i) => forecast.hourly.temperature_2m[start + i]);
    const pops = slice.map((_, i) => forecast.hourly.precipitation_probability[start + i] || 0);
    const min = Math.min(...temps) - 2;
    const max = Math.max(...temps) + 2;
    const w = 640, h = 160, pad = 16;
    const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, slice.length - 1);
    const y = (t) => h - pad - ((t - min) / (max - min)) * (h - pad * 2);
    const line = temps.map((t, i) => `${i ? "L" : "M"}${x(i)},${y(t)}`).join(" ");
    const area = `${line} L${x(temps.length - 1)},${h - pad} L${x(0)},${h - pad} Z`;
    const bars = pops.map((p, i) => {
      const bh = (p / 100) * (h - pad * 2);
      return `<rect x="${x(i) - 3}" y="${h - pad - bh}" width="6" height="${bh}" fill="rgb(197 205 216 / 0.28)" rx="2"/>`;
    }).join("");
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${bars}<path d="${area}" fill="rgb(197 205 216 / 0.16)"/><path d="${line}" fill="none" stroke="#c5cdd8" stroke-width="2"/></svg>`;
  }

  function render() {
    const root = document.getElementById("app");
    const { place, units, saved, loading, error, bundle, locating } = state;
    const starred = saved.some((s) => s.id === place.id);
    const header = `
      <header class="top">
        <div><p class="brand-kicker">Observatory</p><p class="brand-title">Aether</p></div>
        <p class="lede">Live conditions, radar, and forecast from Open-Meteo, RainViewer, and the National Weather Service.</p>
      </header>
      <div class="dock">
        <div class="search-box">
          ${searchIcon}
          <input id="q" placeholder="Search a city" aria-label="Search a city" value="${esc(state.q)}" autocomplete="off"/>
          ${state.hits.length ? `<div class="hits">${state.hits.map((h) => `<button type="button" data-pick="${esc(h.id)}"><span>${esc(h.name)}</span><small>${esc(h.detail)}</small></button>`).join("")}</div>` : ""}
        </div>
        <button class="icon-btn" id="locate" aria-label="Use my location">${locateIcon}</button>
        <button class="icon-btn ${starred ? "star on" : ""}" id="star" aria-label="Save this place">${starIcon}</button>
        <div class="seg">
          <button data-units="imperial" class="${units === "imperial" ? "on" : ""}">°F</button>
          <button data-units="metric" class="${units === "metric" ? "on" : ""}">°C</button>
        </div>
      </div>
      ${saved.length ? `<div class="saved">${saved.map((s) => `<button class="chip ${s.id === place.id ? "on" : ""}" data-saved="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div>` : ""}
    `;

    if (loading) {
      root.innerHTML = header + `<div class="spin" style="height:14rem"></div><div class="metrics">${"<div class='spin' style='height:9rem'></div>".repeat(4)}</div>`;
      bindChrome();
      return;
    }
    if (error || !bundle) {
      root.innerHTML = header + `<article class="panel error"><p class="place">Could not load the sky</p><p class="detail">The public weather sources did not respond. Try another city.</p></article>`;
      bindChrome();
      return;
    }

    const f = bundle.forecast;
    const c = f.current;
    const info = weatherInfo(c.weather_code, c.is_day);
    const idx = hourIndex(f.hourly.time, c.time);
    const uv = c.uv_index ?? f.hourly.uv_index[idx] ?? 0;
    const dew = c.dew_point_2m ?? f.hourly.dew_point_2m[idx];
    const vis = c.visibility ?? f.hourly.visibility[idx];
    const prevP = f.hourly.pressure_msl[Math.max(0, idx - 3)];
    const delta = c.pressure_msl - (prevP ?? c.pressure_msl);
    const list = state.mode === "radar" ? bundle.radar?.radar || [] : bundle.radar?.satellite || [];
    const hours = f.hourly.time.slice(idx, idx + 24);
    const days = f.daily.time.map((t, i) => ({ t, code: f.daily.weather_code[i], max: f.daily.temperature_2m_max[i], min: f.daily.temperature_2m_min[i], pop: f.daily.precipitation_probability_max[i] }));
    const weekMin = Math.min(...days.map((d) => d.min));
    const weekMax = Math.max(...days.map((d) => d.max));
    const span = Math.max(1, weekMax - weekMin);
    const moon = moonPhase(new Date());
    const alerts = (bundle.alerts || []).map((a) => `<article class="alert"><div><strong>${esc(a.event)}</strong><p style="margin:.3rem 0 0">${esc(a.headline)}</p></div></article>`).join("");
    const aqi = bundle.air?.usAqi;

    root.innerHTML = header + `
      ${alerts}
      <div class="grid-hero">
        <article class="panel">
          <p class="kicker">${esc(fmtLong(c.time, f.timezone))}</p>
          <h1 class="place">${esc(place.name)}</h1>
          <p class="detail">${esc(place.detail)}</p>
          <div class="hero-row">
            <p class="temp">${Math.round(c.temperature_2m)}°</p>
            <div class="cond">
              <p>${esc(info.label)}</p>
              <p class="muted">Feels ${Math.round(c.apparent_temperature)}°</p>
              <p class="mono">H ${Math.round(f.daily.temperature_2m_max[0])}° / L ${Math.round(f.daily.temperature_2m_min[0])}°</p>
            </div>
          </div>
        </article>
        <article class="panel radar">
          <header>
            <p class="kicker">Radar</p>
            <div class="seg">
              <button data-mode="radar" class="${state.mode === "radar" ? "on" : ""}">Precip</button>
              <button data-mode="satellite" class="${state.mode === "satellite" ? "on" : ""}">Satellite</button>
            </div>
          </header>
          <div id="radar-map" class="radar-map"></div>
          <footer>
            <button class="icon-btn" id="play">${state.playing ? "Pause" : "Play"}</button>
            <input id="radar-slider" type="range" min="0" max="${Math.max(0, list.length - 1)}" value="${state.frame}"/>
            <span class="mono" id="radar-stamp">—</span>
          </footer>
        </article>
      </div>
      <div class="grid-inst">
        ${windRose(c.wind_speed_10m, c.wind_gusts_10m, c.wind_direction_10m, units)}
        <div class="metrics">
          <article class="panel"><p class="kicker">UV index</p><p class="stat">${Math.round(uv)}</p><p class="detail">${uvBand(uv)}</p>${meter(uv, 12)}</article>
          <article class="panel"><p class="kicker">Humidity</p><p class="stat">${Math.round(c.relative_humidity_2m)}%</p><p class="detail">Dew ${dew == null ? "—" : Math.round(dew) + "°"}</p>${meter(c.relative_humidity_2m, 100)}</article>
          <article class="panel"><p class="kicker">Pressure</p><p class="stat">${esc(fmtPressure(c.pressure_msl, units).split(" ")[0])}</p><p class="detail">${esc(fmtPressure(c.pressure_msl, units).split(" ").slice(1).join(" "))}${Math.abs(delta) >= 0.4 ? (delta > 0 ? " · rising" : " · falling") : " · steady"}</p>${meter(((c.pressure_msl - 980) / 50) * 100, 100)}</article>
          <article class="panel"><p class="kicker">Visibility</p><p class="stat">${vis == null ? "—" : esc(fmtVis(vis, units).split(" ")[0])}</p><p class="detail">${vis == null ? "" : esc(fmtVis(vis, units).split(" ").slice(1).join(" "))} · ${Math.round(c.cloud_cover)}% cloud</p>${meter(c.cloud_cover, 100)}</article>
          <article class="panel" style="grid-column: span 2">
            <p class="kicker">Air quality</p>
            ${aqi == null ? `<p class="detail">Air quality is unavailable for this hour.</p>` : `<p class="stat">${Math.round(aqi)}</p><p class="detail">${aqiBand(aqi)}</p>${meter(aqi, 200)}`}
          </article>
          <article class="panel" style="grid-column: span 2">
            <p class="kicker">Precipitation</p>
            <p class="stat">${Math.round(f.hourly.precipitation_probability[idx] || 0)}%</p>
            <p class="detail">Chance this hour</p>
            ${meter(f.hourly.precipitation_probability[idx] || 0, 100)}
          </article>
        </div>
      </div>
      <section class="panel">
        <p class="kicker">Next 24 hours</p>
        <div class="hours" style="margin-top:1rem">
          ${hours.map((t, i) => `<div class="hour"><span class="mono">${i === 0 ? "Now" : fmtHour(t)}</span><b>${Math.round(f.hourly.temperature_2m[idx + i])}°</b><span class="mono">${f.hourly.precipitation_probability[idx + i] || 0}%</span></div>`).join("")}
        </div>
      </section>
      <section class="panel">
        <p class="kicker">Temperature and chance of precip</p>
        <div style="margin-top:1rem">${chart(f)}</div>
      </section>
      <div class="grid-low">
        <section class="panel">
          <p class="kicker">10-day</p>
          ${days.map((d) => {
            const left = ((d.min - weekMin) / span) * 100;
            const width = Math.max(8, ((d.max - d.min) / span) * 100);
            return `<div class="day"><span class="day-name">${esc(weekday(d.t, c.time, f.timezone))}</span><span class="mono" style="width:2rem">${d.pop}%</span><span class="mono" style="width:2rem;text-align:right">${Math.round(d.min)}°</span><div class="bar"><span style="left:${left}%;width:${width}%"></span></div><span class="mono" style="width:2rem">${Math.round(d.max)}°</span></div>`;
          }).join("")}
        </section>
        <div style="display:grid;gap:.75rem">
          <section class="panel">
            <p class="kicker">Sun path</p>
            <p class="detail" style="display:flex;justify-content:space-between;margin-top:1.2rem">
              <span>${esc(fmtClock(f.daily.sunrise[0]))}</span>
              <span>${esc(fmtClock(f.daily.sunset[0]))}</span>
            </p>
          </section>
          <section class="panel">
            <p class="kicker">Moon</p>
            <p class="place" style="font-size:1.4rem">${esc(moon.name)}</p>
            <p class="mono">${Math.round(moon.illum * 100)}% illuminated</p>
          </section>
        </div>
      </div>
      <footer class="footer">
        <p>Updated ${esc(c.time.replace("T", " "))} · ${esc(f.timezone)} · ${bundle.source === "nws" ? "NWS" : "Open-Meteo"}</p>
        <p>Open-Meteo · RainViewer · NWS · OSM / CARTO</p>
      </footer>
    `;
    bindChrome();
    requestAnimationFrame(mountRadar);
  }

  function bindChrome() {
    const q = document.getElementById("q");
    if (q) {
      q.addEventListener("input", () => {
        state.q = q.value;
        debounceSearch(q.value);
      });
    }
    document.querySelectorAll("[data-pick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hit = state.hits.find((h) => h.id === btn.getAttribute("data-pick"));
        if (hit) { state.place = hit; state.q = ""; state.hits = []; persist(); refresh(); }
      });
    });
    document.querySelectorAll("[data-units]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.units = btn.getAttribute("data-units");
        persist();
        refresh();
      });
    });
    document.querySelectorAll("[data-saved]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = state.saved.find((s) => s.id === btn.getAttribute("data-saved"));
        if (p) { state.place = p; persist(); refresh(); }
      });
    });
    document.getElementById("star")?.addEventListener("click", () => {
      const exists = state.saved.some((s) => s.id === state.place.id);
      state.saved = exists ? state.saved.filter((s) => s.id !== state.place.id) : [...state.saved, state.place].slice(-8);
      persist();
      render();
    });
    document.getElementById("locate")?.addEventListener("click", locate);
    document.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.mode = btn.getAttribute("data-mode");
        state.frame = 0;
        render();
      });
    });
    document.getElementById("play")?.addEventListener("click", () => {
      state.playing = !state.playing;
      render();
    });
    document.getElementById("radar-slider")?.addEventListener("input", (e) => {
      state.playing = false;
      state.frame = Number(e.target.value);
      render();
    });
  }

  let searchTimer;
  function debounceSearch(q) {
    clearTimeout(searchTimer);
    if (q.trim().length < 2) { state.hits = []; render(); return; }
    searchTimer = setTimeout(async () => {
      try { state.hits = await searchPlaces(q.trim()); } catch { state.hits = []; }
      render();
      const input = document.getElementById("q");
      if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }, 220);
  }

  async function locate() {
    if (!navigator.geolocation) return;
    state.locating = true;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      state.place = await reversePlace(pos.coords.latitude, pos.coords.longitude);
      persist();
      refresh();
    }, () => { state.locating = false; });
  }

  async function refresh() {
    state.loading = true;
    state.error = null;
    render();
    try {
      state.bundle = await loadWeather(state.place.lat, state.place.lon, state.units);
      const list = state.bundle.radar?.radar || [];
      state.frame = Math.max(0, list.length - 1);
      state.loading = false;
    } catch (err) {
      state.error = err;
      state.loading = false;
    }
    render();
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
      e.preventDefault();
      document.getElementById("q")?.focus();
    }
  });

  refresh();
})();
