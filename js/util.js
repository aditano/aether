export const CARD = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

export const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const r1 = (n) => Math.round(Number(n) * 10) / 10;

export function weatherInfo(code, isDay) {
  if (code === 0) return { label: isDay ? "Clear" : "Clear night", kind: "clear" };
  if (code === 1) return { label: isDay ? "Mostly clear" : "Mostly clear", kind: "clear" };
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

const CARD_NAME = {
  N: "north",
  NNE: "north-northeast",
  NE: "northeast",
  ENE: "east-northeast",
  E: "east",
  ESE: "east-southeast",
  SE: "southeast",
  SSE: "south-southeast",
  S: "south",
  SSW: "south-southwest",
  SW: "southwest",
  WSW: "west-southwest",
  W: "west",
  WNW: "west-northwest",
  NW: "northwest",
  NNW: "north-northwest",
};

export function cardinal(deg) {
  return CARD[Math.round((((Number(deg) % 360) + 360) % 360) / 22.5) % 16];
}

export function cardinalName(deg) {
  return CARD_NAME[cardinal(deg)] || "";
}

export function uvBand(uv) {
  if (uv == null || Number.isNaN(uv)) return { label: "—", cls: "band-muted" };
  if (uv <= 2) return { label: "Low", cls: "uv-low" };
  if (uv <= 5) return { label: "Moderate", cls: "uv-mod" };
  if (uv <= 7) return { label: "High", cls: "uv-high" };
  if (uv <= 10) return { label: "Very high", cls: "uv-vhigh" };
  return { label: "Extreme", cls: "uv-ext" };
}

export function aqiBand(v) {
  if (v == null || Number.isNaN(v)) return { label: "—", cls: "band-muted" };
  if (v <= 50) return { label: "Good", cls: "aqi-good" };
  if (v <= 100) return { label: "Moderate", cls: "aqi-mod" };
  if (v <= 150) return { label: "Unhealthy for sensitive groups", cls: "aqi-usg" };
  if (v <= 200) return { label: "Unhealthy", cls: "aqi-unh" };
  if (v <= 300) return { label: "Very unhealthy", cls: "aqi-vunh" };
  return { label: "Hazardous", cls: "aqi-haz" };
}

export function alertTone(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "extreme" || s === "severe") return "severe";
  if (s === "moderate") return "moderate";
  return "minor";
}

function isNaive(iso) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso || "") && !/Z$|[+-]\d\d:\d\d$/.test(iso);
}

export function minutesOf(iso) {
  if (!iso) return null;
  const [h, m] = String(iso).slice(11, 16).split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

export function fmtHour(iso) {
  const h = Number(String(iso).slice(11, 13));
  const d = new Date(2000, 0, 1, h);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric" }).format(d);
}

export function fmtClock(iso) {
  if (!iso) return "—";
  const [h, m] = String(iso).slice(11, 16).split(":").map(Number);
  if (Number.isNaN(h)) return "—";
  const d = new Date(2000, 0, 1, h, m || 0);
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
}

export function fmtLong(iso, tz) {
  const d = isNaive(iso) ? new Date(iso.slice(0, 10) + "T12:00:00") : new Date(iso);
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d);
}

export function weekday(iso, nowIso, tz) {
  const day = iso.slice(0, 10);
  const today = nowIso.slice(0, 10);
  if (day === today) return "Today";
  const [y, m, d] = today.split("-").map(Number);
  const tmr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  if (day === tmr) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(day + "T12:00:00"));
}

export function hourIndex(times, current) {
  const key = String(current).slice(0, 13);
  const i = times.findIndex((t) => t.slice(0, 13) >= key);
  return i < 0 ? 0 : i;
}

export function fmtPressure(hpa, units) {
  if (hpa == null || Number.isNaN(Number(hpa))) return { value: "—", unit: "" };
  return units === "imperial"
    ? { value: (Number(hpa) * 0.02953).toFixed(2), unit: "inHg" }
    : { value: String(Math.round(hpa)), unit: "hPa" };
}

export function todayDailyIndex(forecast) {
  const times = forecast?.daily?.time;
  if (!times?.length) return 0;
  const today = String(forecast.current?.time || "").slice(0, 10);
  if (!today) return 0;
  const i = times.findIndex((t) => String(t).slice(0, 10) >= today);
  return i < 0 ? 0 : i;
}

export function hourSerial(iso) {
  const s = String(iso || "");
  if (s.length < 13) return null;
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const h = Number(s.slice(11, 13));
  if ([y, mo, d, h].some((n) => Number.isNaN(n))) return null;
  return Date.UTC(y, mo - 1, d, h);
}

export function findHourOffset(times, currentIso, offsetHours) {
  if (!times?.length) return -1;
  const target = hourSerial(currentIso);
  if (target == null) return -1;
  const want = target - offsetHours * 3600000;
  return times.findIndex((t) => hourSerial(t) === want);
}

export function proseTime(iso) {
  const s = String(iso || "");
  let h = Number(s.slice(11, 13));
  const m = Number(s.slice(14, 16));
  if (Number.isNaN(h)) return "";
  const suffix = h >= 12 ? "pm" : "am";
  h %= 12;
  if (h === 0) h = 12;
  if (!m) return `${h}${suffix}`;
  return `${h}:${String(m).padStart(2, "0")}${suffix}`;
}

export function proseWhen(iso, nowIso) {
  const t = proseTime(iso);
  if (!t) return "";
  const day = String(iso).slice(0, 10);
  const today = String(nowIso || "").slice(0, 10);
  if (today && day && day !== today) return `${t} tomorrow`;
  return t;
}

export function fmtCoord(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(Number(lat)).toFixed(2)}°${ns} ${Math.abs(Number(lon)).toFixed(2)}°${ew}`;
}

export function fmtVis(v, units) {
  if (v == null) return { value: "—", unit: "" };
  if (units === "imperial") {
    const mi = v / 5280;
    if (mi >= 10) return { value: String(Math.round(mi)), unit: "mi" };
    if (mi >= 1) return { value: String(r1(mi)), unit: "mi" };
    return { value: String(Math.round(v)), unit: "ft" };
  }
  const km = v / 1000;
  if (km >= 10) return { value: String(Math.round(km)), unit: "km" };
  if (km >= 1) return { value: String(r1(km)), unit: "km" };
  return { value: String(Math.round(v)), unit: "m" };
}

export function fmtPrecip(v, units) {
  if (v == null) return "—";
  if (units === "imperial") {
    if (v < 0.005) return "0 in";
    return `${v < 1 ? Number(v).toFixed(2) : r1(v)} in`;
  }
  if (v < 0.05) return "0 mm";
  return `${v < 10 ? r1(v) : Math.round(v)} mm`;
}

export function fmtWhen(iso, tz) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fmtClock(iso);
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

export function moonPhase(date) {
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
  return { name, illum, t };
}

export function timeOfDay(currentIso, sunrise, sunset, isDay) {
  const now = minutesOf(currentIso);
  const rise = minutesOf(sunrise);
  const set = minutesOf(sunset);
  if (now == null || rise == null || set == null) return isDay ? "day" : "night";
  if (now < rise - 50 || now > set + 50) return "night";
  if (now < rise + 40) return "dawn";
  if (now > set - 40) return "dusk";
  return "day";
}

export function inConus(lat, lon) {
  return lat >= 24.4 && lat <= 49.5 && lon >= -124.9 && lon <= -66.8;
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function hasWebGL2() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

export async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("fail " + res.status);
  return res.json();
}

export const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>`;
export const locateIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
export const starIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3l2.6 6.4L21 10l-4.5 4.2L17.8 21 12 17.8 6.2 21l1.3-6.8L3 10l6.4-.6z"/></svg>`;
export const expandIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M20 15v5h-5"/></svg>`;
export const collapseIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 9L4 4M4 9V4h5M15 9l5-5M20 9V4h-5M9 15l-5 5M4 15v5h5M15 15l5 5M20 15v5h-5"/></svg>`;
export const playIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
export const pauseIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
export const recenterIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/><circle cx="12" cy="12" r="8"/></svg>`;
export const closeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
