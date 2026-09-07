import { CARD, getJson } from "./util.js";

export async function searchPlaces(q) {
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

export async function reversePlace(lat, lon) {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lon.toFixed(4));
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const json = await getJson(url);
    const r = json.results?.[0];
    if (r) {
      return {
        id: String(r.id),
        name: r.name,
        detail: [r.admin1, r.country].filter(Boolean).join(", "),
        lat,
        lon,
      };
    }
  } catch {}
  return {
    id: `${lat.toFixed(3)},${lon.toFixed(3)}`,
    name: "My location",
    detail: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
    lat,
    lon,
  };
}

const CURRENT =
  "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,uv_index,dew_point_2m";
const HOURLY =
  "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,is_day,pressure_msl";
const DAILY =
  "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunshine_duration";

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
  if (!nums.length) return null;
  const mph = nums.length === 1 ? nums[0] : (nums[0] + nums[1]) / 2;
  return units === "imperial" ? mph : mph * 1.60934;
}

function dirToDeg(dir) {
  if (typeof dir === "number") return dir;
  const i = CARD.indexOf(String(dir || "").toUpperCase());
  return i >= 0 ? i * 22.5 : null;
}

function localStamp(iso, tz) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t)?.value || "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

function qty(v) {
  return v && typeof v.value === "number" ? v.value : null;
}

const toF = (c) => (c * 9) / 5 + 32;
const toC = (f) => ((f - 32) * 5) / 9;

async function fetchNws(lat, lon, units) {
  const points = await getJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
    Accept: "application/geo+json",
  });
  const tz = points.properties.timeZone;
  const [hourlyJ, dailyJ, stationsJ] = await Promise.all([
    getJson(points.properties.forecastHourly, { Accept: "application/geo+json" }),
    getJson(points.properties.forecast, { Accept: "application/geo+json" }),
    getJson(points.properties.observationStations, { Accept: "application/geo+json" }),
  ]);
  const sid = stationsJ.features[0]?.properties.stationIdentifier;
  let obs = null;
  if (sid) {
    try {
      obs = (await getJson(`https://api.weather.gov/stations/${sid}/observations/latest`, { Accept: "application/geo+json" }))
        .properties;
    } catch {}
  }
  const conv = (v, from) => {
    if (v == null) return null;
    const c = from === "C" ? v : toC(v);
    return units === "imperial" ? toF(c) : c;
  };
  const periods = hourlyJ.properties.periods.slice(0, 48);
  const hourly = {
    time: [],
    temperature_2m: [],
    relative_humidity_2m: [],
    dew_point_2m: [],
    apparent_temperature: [],
    precipitation_probability: [],
    precipitation: [],
    weather_code: [],
    cloud_cover: [],
    visibility: [],
    wind_speed_10m: [],
    wind_direction_10m: [],
    wind_gusts_10m: [],
    uv_index: [],
    is_day: [],
    pressure_msl: [],
  };
  const visM = qty(obs?.visibility);
  const humidity = qty(obs?.relativeHumidity);
  const pressure = qty(obs?.barometricPressure);
  for (const p of periods) {
    const from = p.temperatureUnit === "C" ? "C" : "F";
    hourly.time.push(localStamp(p.startTime, tz));
    hourly.temperature_2m.push(conv(p.temperature, from));
    hourly.relative_humidity_2m.push(p.relativeHumidity?.value ?? humidity);
    hourly.dew_point_2m.push(p.dewpoint?.value != null ? conv(p.dewpoint.value, "C") : null);
    hourly.apparent_temperature.push(conv(p.temperature, from));
    hourly.precipitation_probability.push(p.probabilityOfPrecipitation?.value ?? null);
    hourly.precipitation.push(null);
    hourly.weather_code.push(codeFromText(p.shortForecast));
    hourly.cloud_cover.push(null);
    hourly.visibility.push(visM == null ? null : units === "imperial" ? visM * 3.28084 : visM);
    hourly.wind_speed_10m.push(parseWind(p.windSpeed, units));
    hourly.wind_direction_10m.push(dirToDeg(p.windDirection));
    hourly.wind_gusts_10m.push(parseWind(p.windGust || p.windSpeed, units));
    hourly.uv_index.push(null);
    hourly.is_day.push(/\/day\//.test(p.icon || "") ? 1 : 0);
    hourly.pressure_msl.push(pressure != null ? pressure / 100 : null);
  }
  const days = new Map();
  for (const p of dailyJ.properties.periods) {
    const day = localStamp(p.startTime, tz).slice(0, 10);
    const from = p.temperatureUnit === "C" ? "C" : "F";
    const temp = conv(p.temperature, from);
    const cur = days.get(day) || {
      max: temp,
      min: temp,
      code: codeFromText(p.shortForecast),
      pop: p.probabilityOfPrecipitation?.value ?? null,
    };
    if (p.isDaytime) {
      cur.max = Math.max(cur.max, temp);
      cur.code = codeFromText(p.shortForecast);
    } else cur.min = Math.min(cur.min, temp);
    const pop = p.probabilityOfPrecipitation?.value;
    if (pop != null) cur.pop = Math.max(cur.pop ?? 0, pop);
    days.set(day, cur);
  }
  const keys = [...days.keys()].slice(0, 10);
  const daily = {
    time: keys,
    weather_code: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    sunrise: [],
    sunset: [],
    uv_index_max: [],
    precipitation_sum: [],
    precipitation_probability_max: [],
    wind_speed_10m_max: [],
    wind_gusts_10m_max: [],
    wind_direction_10m_dominant: [],
    sunshine_duration: [],
  };
  for (const k of keys) {
    const d = days.get(k);
    daily.weather_code.push(d.code);
    daily.temperature_2m_max.push(d.max);
    daily.temperature_2m_min.push(d.min);
    daily.sunrise.push(null);
    daily.sunset.push(null);
    daily.uv_index_max.push(null);
    daily.precipitation_sum.push(null);
    daily.precipitation_probability_max.push(d.pop);
    daily.wind_speed_10m_max.push(null);
    daily.wind_gusts_10m_max.push(null);
    daily.wind_direction_10m_dominant.push(null);
    daily.sunshine_duration.push(null);
  }
  const tempC = qty(obs?.temperature);
  const appC = qty(obs?.heatIndex) ?? qty(obs?.windChill) ?? tempC;
  const dewC = qty(obs?.dewpoint);
  const windKmh = qty(obs?.windSpeed);
  const gustKmh = qty(obs?.windGust);
  return {
    timezone: tz,
    current: {
      time: localStamp(obs?.timestamp || periods[0].startTime, tz),
      temperature_2m: tempC != null ? conv(tempC, "C") : hourly.temperature_2m[0],
      relative_humidity_2m: humidity,
      apparent_temperature: appC != null ? conv(appC, "C") : hourly.apparent_temperature[0],
      is_day: /\/day\//.test(obs?.icon || periods[0]?.icon || "") ? 1 : hourly.is_day[0],
      precipitation: null,
      weather_code: codeFromText(obs?.textDescription || periods[0]?.shortForecast),
      cloud_cover: null,
      pressure_msl: pressure != null ? pressure / 100 : null,
      wind_speed_10m: windKmh == null ? hourly.wind_speed_10m[0] : units === "imperial" ? windKmh * 0.621371 : windKmh,
      wind_direction_10m: dirToDeg(qty(obs?.windDirection)) ?? hourly.wind_direction_10m[0],
      wind_gusts_10m:
        gustKmh == null
          ? hourly.wind_gusts_10m[0]
          : units === "imperial"
            ? gustKmh * 0.621371
            : gustKmh,
      visibility: visM == null ? null : units === "imperial" ? visM * 3.28084 : visM,
      uv_index: null,
      dew_point_2m: dewC != null ? conv(dewC, "C") : null,
    },
    hourly,
    daily,
  };
}

async function fetchAir(lat, lon) {
  const j = await getJson(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&timezone=auto`,
  );
  if (!j.current) return null;
  return {
    usAqi: j.current.us_aqi,
    pm25: j.current.pm2_5,
    pm10: j.current.pm10,
    ozone: j.current.ozone,
    no2: j.current.nitrogen_dioxide,
  };
}

async function fetchRainviewer() {
  const j = await getJson("https://api.rainviewer.com/public/weather-maps.json");
  return {
    host: j.host,
    past: j.radar?.past || [],
    nowcast: j.radar?.nowcast || [],
    satellite: j.satellite?.infrared || [],
  };
}

async function fetchAlerts(lat, lon) {
  const j = await getJson(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`, {
    Accept: "application/geo+json",
  });
  return (j.features || []).slice(0, 6).map((f, i) => {
    const p = f.properties || {};
    return {
      id: f.id || String(i),
      event: p.event || "Alert",
      headline: p.headline || p.event || "Alert",
      description: p.description || "",
      instruction: p.instruction || "",
      severity: p.severity || "",
      urgency: p.urgency || "",
      ends: p.ends || p.expires || "",
      geometry: f.geometry,
    };
  });
}

export async function loadWeather(lat, lon, units) {
  let wx;
  try {
    wx = { forecast: await fetchOpenMeteo(lat, lon, units), source: "open-meteo" };
  } catch {
    wx = { forecast: await fetchNws(lat, lon, units), source: "nws" };
  }
  const extras = await Promise.allSettled([fetchAir(lat, lon), fetchRainviewer(), fetchAlerts(lat, lon)]);
  const air = extras[0].status === "fulfilled" ? extras[0].value : null;
  const rainviewer = extras[1].status === "fulfilled" ? extras[1].value : null;
  const alerts = extras[2].status === "fulfilled" ? extras[2].value : [];
  return { ...wx, air, rainviewer, alerts };
}
