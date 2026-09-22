import { fmtPrecip, hourIndex, minutesOf, proseTime, proseWhen, todayDailyIndex, weatherInfo } from "./util.js";

export const ARC = { width: 960, height: 208, pad: 8, count: 24 };

const BANDS = {
  "clear-day": "#3f4d66",
  "clear-dawn": "#6a4634",
  "clear-dusk": "#6a4038",
  "clear-night": "#161b2e",
  "cloud-day": "#3a404c",
  "cloud-dawn": "#4e403c",
  "cloud-dusk": "#463c44",
  "cloud-night": "#232833",
  "rain-day": "#2c4156",
  "rain-dawn": "#3d4558",
  "rain-dusk": "#3a3c58",
  "rain-night": "#1b2838",
  "storm-day": "#4a3040",
  "storm-dawn": "#5a3840",
  "storm-dusk": "#4a3048",
  "storm-night": "#2c1e2c",
  "snow-day": "#44505c",
  "snow-dawn": "#5a504c",
  "snow-dusk": "#4c505c",
  "snow-night": "#2c343e",
  "fog-day": "#3e4044",
  "fog-dawn": "#4a4440",
  "fog-dusk": "#444248",
  "fog-night": "#2c2e32",
};

function sunOnDay(hourIso, rise, set, nextRise, nextSet) {
  const day = String(hourIso).slice(0, 10);
  let riseIso = null;
  let setIso = null;
  if (rise && String(rise).slice(0, 10) === day) riseIso = rise;
  if (nextRise && String(nextRise).slice(0, 10) === day) riseIso = nextRise;
  if (set && String(set).slice(0, 10) === day) setIso = set;
  if (nextSet && String(nextSet).slice(0, 10) === day) setIso = nextSet;
  return { rise: minutesOf(riseIso), set: minutesOf(setIso) };
}

function bandKey(hour, riseMin, setMin) {
  const minute = minutesOf(hour.iso);
  let phase = hour.isDay ? "day" : "night";
  if (minute != null && riseMin != null && Math.abs(minute - riseMin) <= 50) phase = "dawn";
  else if (minute != null && setMin != null && Math.abs(minute - setMin) <= 50) phase = "dusk";
  return `${hour.kind}-${phase}`;
}

function arcCaption(hours, current) {
  const nowIso = current.time;
  const pts = hours.filter((hour) => hour.temp != null);
  if (!pts.length) return "";
  const min = pts.reduce((a, b) => (a.temp < b.temp ? a : b));
  const max = pts.reduce((a, b) => (a.temp > b.temp ? a : b));
  const rmin = Math.round(min.temp);
  const rmax = Math.round(max.temp);
  if (rmax - rmin < 4) return `Holding between ${rmin}° and ${rmax}°.`;
  const sameDay = String(min.iso).slice(0, 10) === String(max.iso).slice(0, 10);
  if (max.rel === 0) return `Down to ${rmin}° around ${proseWhen(min.iso, nowIso)}.`;
  if (min.rel === 0) return `Up to ${rmax}° around ${proseWhen(max.iso, nowIso)}.`;
  if (min.rel < max.rel) {
    const maxWhen = sameDay ? proseTime(max.iso) : proseWhen(max.iso, nowIso);
    return `Down to ${rmin}° around ${proseWhen(min.iso, nowIso)}, then ${rmax}° around ${maxWhen}.`;
  }
  const minWhen = sameDay ? proseTime(min.iso) : proseWhen(min.iso, nowIso);
  return `Up to ${rmax}° around ${proseWhen(max.iso, nowIso)}, then ${rmin}° around ${minWhen}.`;
}

function tipFor(hour, units) {
  const bits = [hour.label];
  if (hour.temp != null) bits.push(`${Math.round(hour.temp)}°`);
  if (hour.feels != null && hour.temp != null && Math.round(hour.feels) !== Math.round(hour.temp)) {
    bits.push(`feels ${Math.round(hour.feels)}°`);
  }
  if (hour.condition) bits.push(hour.condition);
  if (hour.pop >= 10) bits.push(`${Math.round(hour.pop)}%`);
  if (hour.amt > 0) bits.push(fmtPrecip(hour.amt, units));
  return bits.filter(Boolean).join(" · ");
}

function escAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function arcSvg(hours, forecast, suns) {
  const { width, height, pad } = ARC;
  const col = (width - pad * 2) / hours.length;
  const bandTop = 36;
  const bandBot = 152;
  const temps = hours.map((hour) => hour.temp).filter((temp) => temp != null);
  let min = Math.min(...temps);
  let max = Math.max(...temps);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  if (min === max) {
    min -= 1;
    max += 1;
  }
  min -= 1;
  max += 1;
  const yOf = (temp) => bandTop + 8 + ((max - temp) / (max - min)) * (bandBot - bandTop - 16);
  const rects = hours.map((hour, i) => {
    const sun = sunOnDay(hour.iso, suns.rise, suns.set, suns.nextRise, suns.nextSet);
    const color = BANDS[bandKey(hour, sun.rise, sun.set)] || BANDS["cloud-day"];
    const x = pad + i * col;
    return `<rect x="${x.toFixed(1)}" y="${bandTop}" width="${(col + 0.5).toFixed(2)}" height="${bandBot - bandTop}" fill="${color}"/>`;
  }).join("");
  const pops = hours.map((hour, i) => {
    if ((hour.pop || 0) < 10) return "";
    const bar = (hour.pop / 100) * 30;
    const x = pad + i * col;
    return `<rect x="${x.toFixed(1)}" y="${(bandBot - bar).toFixed(1)}" width="${col.toFixed(2)}" height="${bar.toFixed(1)}" fill="rgb(126 182 224 / 0.42)"/>`;
  }).join("");
  const points = [];
  hours.forEach((hour, i) => {
    if (hour.temp == null) return;
    points.push(`${(pad + i * col).toFixed(1)},${yOf(hour.temp).toFixed(1)}`);
  });
  const line = points.length ? `M${points.join(" L")}` : "";
  const minute = Number(String(forecast.current.time).slice(14, 16)) || 0;
  const nowX = pad + (minute / 60) * col;
  const nowTemp = forecast.current.temperature_2m;
  const minHour = hours.reduce((a, b) => (a.temp != null && (b.temp == null || a.temp < b.temp) ? a : b));
  const maxHour = hours.reduce((a, b) => (a.temp != null && (b.temp == null || a.temp > b.temp) ? a : b));
  const spread = Math.round(maxHour.temp) - Math.round(minHour.temp);
  const mark = (hour, text) => {
    const i = hours.indexOf(hour);
    const x = Math.max(pad + 14, Math.min(width - pad - 14, pad + i * col));
    const y = Math.max(16, yOf(hour.temp) - 10);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" fill="#f4efe4" font-size="12" font-family="IBM Plex Mono, ui-monospace, monospace" stroke="#08090b" stroke-width="3" paint-order="stroke">${text}</text>`;
  };
  const extremes = spread >= 4 ? `${mark(maxHour, `${Math.round(maxHour.temp)}°`)}${minHour !== maxHour ? mark(minHour, `${Math.round(minHour.temp)}°`) : ""}` : "";
  const labels = hours.map((hour, i) => {
    if (i === 0 || i % 3 !== 0) return "";
    const x = pad + (i + 0.5) * col;
    return `<text x="${x.toFixed(1)}" y="186" text-anchor="middle" fill="#8b909a" font-size="11" font-family="IBM Plex Mono, ui-monospace, monospace">${proseTime(hour.iso)}</text>`;
  }).join("");
  const nowLabelX = Math.max(pad + 16, Math.min(width - pad - 16, nowX));
  const sunMark = (iso) => {
    if (!iso) return "";
    const key = String(iso).slice(0, 13);
    const i = hours.findIndex((hour) => String(hour.iso).slice(0, 13) === key);
    if (i < 0) return "";
    const at = Number(String(iso).slice(14, 16)) || 0;
    const x = pad + (i + at / 60) * col;
    return `<line x1="${x.toFixed(1)}" y1="${bandTop}" x2="${x.toFixed(1)}" y2="${bandTop + 12}" stroke="#e8c37a" stroke-width="1.5"/>`;
  };
  return `<svg class="arc-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escAttr(arcCaption(hours, forecast.current))}">
    ${rects}${pops}
    <rect x="${pad}" y="${bandTop}" width="${width - pad * 2}" height="${(bandBot - bandTop) * 0.42}" fill="rgb(255 255 255 / 0.05)"/>
    ${line ? `<path d="${line}" fill="none" stroke="rgb(0 0 0 / 0.45)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
    ${line ? `<path d="${line}" fill="none" stroke="#f4efe4" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
    ${extremes}
    <text x="${nowLabelX.toFixed(1)}" y="186" text-anchor="middle" fill="#f4efe4" font-size="11" font-family="IBM Plex Mono, ui-monospace, monospace">Now</text>
    <line x1="${nowX.toFixed(1)}" y1="${bandTop - 6}" x2="${nowX.toFixed(1)}" y2="${bandBot}" stroke="#f4efe4" stroke-width="1.25"/>
    ${nowTemp == null ? "" : `<circle cx="${nowX.toFixed(1)}" cy="${yOf(nowTemp).toFixed(1)}" r="3.5" fill="#f4efe4"/>`}
    ${sunMark(suns.rise)}${sunMark(suns.set)}${sunMark(suns.nextRise)}${sunMark(suns.nextSet)}
    ${labels}
  </svg>`;
}

export function buildArc(forecast, units) {
  if (!forecast?.hourly?.time?.length || !forecast.current) return null;
  const idx = hourIndex(forecast.hourly.time, forecast.current.time);
  const dayIdx = todayDailyIndex(forecast);
  const hours = [];
  for (let n = 0; n < ARC.count; n++) {
    const i = idx + n;
    const iso = forecast.hourly.time[i];
    if (!iso) break;
    const code = forecast.hourly.weather_code?.[i];
    const isDay = forecast.hourly.is_day?.[i];
    const info = weatherInfo(code, isDay);
    hours.push({
      iso,
      rel: n,
      temp: forecast.hourly.temperature_2m?.[i] ?? null,
      feels: forecast.hourly.apparent_temperature?.[i] ?? null,
      pop: forecast.hourly.precipitation_probability?.[i] ?? 0,
      amt: forecast.hourly.precipitation?.[i] ?? 0,
      isDay,
      kind: info.kind,
      condition: info.label,
      label: proseWhen(iso, forecast.current.time),
    });
  }
  if (hours.length < 2) return null;
  const suns = {
    rise: forecast.daily?.sunrise?.[dayIdx] || null,
    set: forecast.daily?.sunset?.[dayIdx] || null,
    nextRise: forecast.daily?.sunrise?.[dayIdx + 1] || null,
    nextSet: forecast.daily?.sunset?.[dayIdx + 1] || null,
  };
  const caption = arcCaption(hours, forecast.current);
  return {
    caption,
    svg: arcSvg(hours, forecast, suns),
    hours: hours.map((hour) => ({ detail: tipFor(hour, units) })),
    count: hours.length,
    width: ARC.width,
    pad: ARC.pad,
  };
}
