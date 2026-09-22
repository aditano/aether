import assert from "node:assert/strict";
import test from "node:test";
import { buildArc } from "../js/arc.js";
import { composeBriefing } from "../js/briefing.js";
import { hourSerial, todayDailyIndex } from "../js/util.js";

function isoFromSerial(serial) {
  const d = new Date(serial);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:00`;
}

function makeForecast({ start, end, now, at = () => ({}), current = {}, daily }) {
  const times = [];
  for (let s = hourSerial(start); s <= hourSerial(end); s += 3600000) times.push(isoFromSerial(s));
  const row = (iso, index) => ({
    temp: 60,
    feels: 58,
    pop: 0,
    amt: 0,
    code: 0,
    cloud: 0,
    wind: 5,
    gust: 8,
    dew: 48,
    pressure: 1016,
    day: 1,
    ...at(iso, index),
  });
  const rows = times.map((iso, index) => row(iso, index));
  const nowIso = now || times[0];
  const nowKey = nowIso.slice(0, 13);
  const nowRow = rows[times.findIndex((iso) => iso.slice(0, 13) === nowKey)] || rows[0];
  const col = (key) => rows.map((item) => item[key]);
  return {
    timezone: "America/New_York",
    current: {
      time: nowIso,
      temperature_2m: current.temp ?? nowRow.temp,
      apparent_temperature: current.feels ?? nowRow.feels,
      weather_code: current.code ?? nowRow.code,
      precipitation: current.precip ?? 0,
      cloud_cover: current.cloud ?? nowRow.cloud,
      pressure_msl: current.pressure ?? nowRow.pressure,
      wind_speed_10m: current.wind ?? nowRow.wind,
      wind_direction_10m: current.dir ?? 0,
      wind_gusts_10m: current.gust ?? nowRow.gust,
      relative_humidity_2m: current.rh ?? 50,
      visibility: current.vis ?? 52800,
      uv_index: current.uv ?? 1,
      dew_point_2m: current.dew ?? nowRow.dew,
      is_day: current.day ?? nowRow.day,
    },
    hourly: {
      time: times,
      temperature_2m: col("temp"),
      apparent_temperature: col("feels"),
      precipitation_probability: col("pop"),
      precipitation: col("amt"),
      weather_code: col("code"),
      cloud_cover: col("cloud"),
      wind_speed_10m: col("wind"),
      wind_gusts_10m: col("gust"),
      dew_point_2m: col("dew"),
      pressure_msl: col("pressure"),
      is_day: col("day"),
    },
    daily: daily || {
      time: [nowIso.slice(0, 10)],
      weather_code: [0],
      temperature_2m_max: [70],
      temperature_2m_min: [50],
      sunrise: [`${nowIso.slice(0, 10)}T06:30`],
      sunset: [`${nowIso.slice(0, 10)}T19:00`],
      precipitation_probability_max: [0],
      precipitation_sum: [0],
    },
  };
}

test("a quiet afternoon stays quiet", () => {
  const forecast = makeForecast({
    start: "2026-09-22T12:00",
    end: "2026-09-23T12:00",
    now: "2026-09-22T14:00",
    at: () => ({ temp: 70, feels: 70, code: 0, cloud: 0, day: 1 }),
    current: { temp: 70, feels: 70, code: 0, cloud: 0, day: 1, rh: 40, dew: 45 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "Clear and quiet this afternoon.");
  assert.equal(briefing.practical, "Shirt sleeves.");
  assert.equal(briefing.rows.find((row) => row.id === "air").gloss, "Crisp air.");
});

test("morning chill that becomes shirt sleeves", () => {
  const forecast = makeForecast({
    start: "2026-09-22T06:00",
    end: "2026-09-22T15:00",
    now: "2026-09-22T06:00",
    at: (iso) => {
      const hour = Number(iso.slice(11, 13));
      const temps = { 6: 42, 7: 44, 8: 47, 9: 50, 10: 54, 11: 58, 12: 62, 13: 65, 14: 67, 15: 68 };
      const temp = temps[hour] ?? 60;
      return { temp, feels: temp - 2, code: 1, cloud: 10, day: hour >= 7 ? 1 : 0 };
    },
    current: { temp: 42, feels: 40, code: 1, cloud: 10, day: 0, dew: 30 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "It warms to 68° by 3pm.");
  assert.equal(briefing.practical, "Coat weather until about 3pm, then shirt sleeves.");
});

test("rain that already came through is not described as still coming", () => {
  const wet = { pop: 70, amt: 0.04, code: 61, cloud: 100, day: 1 };
  const forecast = makeForecast({
    start: "2026-09-21T18:00",
    end: "2026-09-23T18:00",
    now: "2026-09-22T18:30",
    at: (iso) => {
      const key = iso.slice(5, 13);
      if (["09-22T06", "09-22T07", "09-22T08", "09-22T09"].includes(key)) return { ...wet, temp: 57 };
      if (key === "09-22T02") return { ...wet, amt: 0.05, temp: 60 };
      if (key === "09-23T05" || key === "09-23T06") return { temp: 53, feels: 49, gust: 26, cloud: 100, code: 3, day: 0 };
      if (key === "09-23T10") return { temp: 55, feels: 50, gust: 32, wind: 14, cloud: 100, code: 3, day: 1 };
      if (key === "09-23T08") return { temp: 53, feels: 48, code: 51, amt: 0.003, pop: 14, cloud: 100, day: 1 };
      if (iso.slice(0, 10) === "2026-09-21") return { temp: 68, feels: 66, code: 3, cloud: 80 };
      return { temp: 60, feels: 57, code: 3, cloud: 100, gust: 16, wind: 8, day: iso.slice(11, 13) < "19" && iso.slice(11, 13) >= "07" ? 1 : 0 };
    },
    current: { temp: 61, feels: 59, code: 3, cloud: 100, gust: 19, wind: 7, dew: 53, rh: 75, day: 1, dir: 57 },
    daily: {
      time: ["2026-09-22", "2026-09-23"],
      weather_code: [3, 3],
      temperature_2m_max: [63, 64],
      temperature_2m_min: [56, 53],
      sunrise: ["2026-09-22T06:49", "2026-09-23T06:50"],
      sunset: ["2026-09-22T18:58", "2026-09-23T18:56"],
      precipitation_probability_max: [70, 10],
      precipitation_sum: [0.2, 0],
    },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "The rain already came through.");
  assert.match(briefing.support, /night stays dry/i);
  assert.match(briefing.support, /Gusts climb toward 32 mph around 10am tomorrow/);
  assert.equal(briefing.practical, "A light jacket will do.");
  assert.equal(briefing.rows.find((row) => row.id === "sky").value, "28 min");
  assert.match(briefing.rows.find((row) => row.id === "yesterday").value, /cooler/);
  const arc = buildArc(forecast, "imperial");
  assert.match(arc.caption, /Down to 53° around/);
  assert.match(arc.svg, /<svg/);
});

test("a trace of model drizzle is not a rain event", () => {
  const forecast = makeForecast({
    start: "2026-09-22T12:00",
    end: "2026-09-23T12:00",
    now: "2026-09-22T15:00",
    at: (iso) => {
      if (iso === "2026-09-23T08:00") return { code: 51, amt: 0.003, pop: 12, temp: 61, feels: 59, cloud: 90 };
      return { temp: 64, feels: 62, code: 2, cloud: 40, day: 1 };
    },
    current: { temp: 64, feels: 62, code: 2, cloud: 40, day: 1 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.doesNotMatch(briefing.headline, /rain|drizzle|shower/i);
  assert.equal(briefing.headline, "Partly cloudy and quiet this afternoon.");
});

test("storms get a clock time and the clothing line mentions them", () => {
  const forecast = makeForecast({
    start: "2026-09-22T14:00",
    end: "2026-09-23T02:00",
    now: "2026-09-22T14:00",
    at: (iso) => {
      if (iso === "2026-09-22T16:00") return { code: 95, pop: 80, amt: 0.2, temp: 76, feels: 78, cloud: 90 };
      if (iso === "2026-09-22T17:00") return { code: 95, pop: 70, amt: 0.15, temp: 74, feels: 76, cloud: 90 };
      return { temp: 78, feels: 76, code: 2, cloud: 30, day: 1 };
    },
    current: { temp: 78, feels: 75, code: 2, cloud: 30, day: 1, uv: 7 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "A brief storm around 4pm, about a third of an inch.");
  assert.equal(briefing.practical, "Shirt sleeves, and storms around 4pm.");
});

test("snow keeps its own noun", () => {
  const forecast = makeForecast({
    start: "2026-09-22T20:00",
    end: "2026-09-23T12:00",
    now: "2026-09-22T20:00",
    at: (iso) => {
      if (iso === "2026-09-22T23:00" || iso === "2026-09-23T00:00") {
        return { code: 71, pop: 70, amt: 0.08, temp: 30, feels: 24, cloud: 100, day: 0 };
      }
      return { temp: 31, feels: 26, code: 3, cloud: 80, day: 0 };
    },
    current: { temp: 31, feels: 26, code: 3, cloud: 80, day: 0, dew: 20 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.match(briefing.headline, /^Snow around 11pm/);
  assert.match(briefing.practical, /Freezing weather/);
});

test("a severe alert leads, and the weather follows it", () => {
  const forecast = makeForecast({
    start: "2026-09-22T15:00",
    end: "2026-09-22T22:00",
    now: "2026-09-22T15:00",
    at: () => ({ temp: 80, feels: 82, code: 2, cloud: 40 }),
    current: { temp: 80, feels: 82, code: 2, cloud: 40 },
  });
  const briefing = composeBriefing(forecast, "imperial", {
    alerts: [{ event: "Tornado Warning", severity: "Extreme", headline: "Tornado Warning" }],
  });
  assert.equal(briefing.headline, "Tornado Warning is in effect.");
  assert.match(briefing.support, /quiet this afternoon/i);
  assert.equal(briefing.practical, "See the alert above before you go out.");
});

test("yesterday's temperature becomes the sentence when the sky is dull", () => {
  const forecast = makeForecast({
    start: "2026-09-21T16:00",
    end: "2026-09-22T22:00",
    now: "2026-09-22T16:00",
    at: (iso) => ({ temp: iso.startsWith("2026-09-21") ? 78 : 64, feels: iso.startsWith("2026-09-21") ? 78 : 62, code: 3, cloud: 100 }),
    current: { temp: 64, feels: 62, code: 3, cloud: 100 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "14° cooler than yesterday at this hour.");
  assert.equal(briefing.rows.find((row) => row.id === "yesterday").value, "78°");
});

test("the week sentence names the turn in the pattern", () => {
  const forecast = makeForecast({
    start: "2026-09-22T12:00",
    end: "2026-09-22T18:00",
    now: "2026-09-22T12:00",
    current: { temp: 63, feels: 60, code: 61, cloud: 100 },
    daily: {
      time: ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"],
      weather_code: [61, 61, 3, 3, 0, 0],
      temperature_2m_max: [70, 63, 64, 67, 74, 83],
      temperature_2m_min: [55, 56, 53, 49, 55, 62],
      sunrise: Array(6).fill("2026-09-22T06:40"),
      sunset: Array(6).fill("2026-09-22T19:00"),
      precipitation_probability_max: [40, 71, 10, 5, 10, 5],
      precipitation_sum: [0.1, 0.21, 0, 0, 0, 0],
    },
  });
  assert.equal(todayDailyIndex(forecast), 1);
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(
    briefing.week,
    "Cool, with rain today, then cool and dry tomorrow and Thursday, then mild and dry on Friday, then warm and dry on Saturday.",
  );
});

test("metric thresholds still speak in the selected unit", () => {
  const forecast = makeForecast({
    start: "2026-09-22T08:00",
    end: "2026-09-22T20:00",
    now: "2026-09-22T08:00",
    at: (iso) => {
      const hour = Number(iso.slice(11, 13));
      const temp = hour < 12 ? 8 : 22;
      return { temp, feels: temp, code: 1, cloud: 5, gust: hour === 15 ? 45 : 10 };
    },
    current: { temp: 8, feels: 6, code: 1, cloud: 5, gust: 10, wind: 8 },
  });
  const briefing = composeBriefing(forecast, "metric");
  assert.equal(briefing.headline, "It warms to 22° by 12pm.");
  assert.match(briefing.practical, /Coat weather/);
});

test("missing fields do not throw", () => {
  const forecast = {
    current: { time: "2026-09-22T11:00", temperature_2m: 55, weather_code: 2, is_day: 1 },
    hourly: {
      time: ["2026-09-22T11:00", "2026-09-22T12:00"],
      temperature_2m: [55, 56],
      weather_code: [2, 2],
    },
    daily: { time: ["2026-09-22"], temperature_2m_max: [60], temperature_2m_min: [48], weather_code: [2] },
  };
  const briefing = composeBriefing(forecast, "imperial");
  assert.ok(briefing.headline);
  assert.equal(buildArc(forecast, "imperial").caption, "Holding between 55° and 56°.");
});

test("an eight degree hour jump leads and is not repeated as a note", () => {
  const forecast = makeForecast({
    start: "2026-09-22T14:00",
    end: "2026-09-22T20:00",
    now: "2026-09-22T16:00",
    at: (iso) => ({ temp: iso === "2026-09-22T15:00" ? 84 : 70, feels: 68, code: 2, cloud: 40, day: 1 }),
    current: { temp: 70, feels: 68, code: 2, cloud: 40, day: 1 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "Down 14° in the last hour.");
  assert.equal(briefing.hourNote, null);
});

test("ordinary hot-night cooling stays in the support line", () => {
  const forecast = makeForecast({
    start: "2026-09-22T15:00",
    end: "2026-09-23T08:00",
    now: "2026-09-22T15:45",
    at: (iso) => {
      const hour = Number(iso.slice(11, 13));
      const overnight = iso.startsWith("2026-09-23") && hour <= 5;
      const temp = overnight ? 77 : 98;
      return { temp, feels: temp - 2, code: 3, cloud: 90, day: hour >= 6 && hour < 19 ? 1 : 0 };
    },
    current: { temp: 98, feels: 96, code: 3, cloud: 90, day: 1, uv: 2 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "Overcast and quiet this afternoon.");
  assert.match(briefing.support, /falls to 77°/);
  assert.equal(briefing.practical, "Dress for heat.");
  assert.doesNotMatch(briefing.practical, /Find shade|until about/);
});

test("a short light drizzle does not outrank rain that already fell", () => {
  const wet = { pop: 60, amt: 0.05, code: 61, cloud: 100 };
  const forecast = makeForecast({
    start: "2026-09-22T06:00",
    end: "2026-09-23T14:00",
    now: "2026-09-22T18:30",
    at: (iso) => {
      if (iso === "2026-09-22T08:00" || iso === "2026-09-22T09:00") return { ...wet, temp: 58, day: 1 };
      if (iso === "2026-09-23T10:00" || iso === "2026-09-23T11:00") {
        return { code: 51, pop: 30, amt: 0.012, temp: 55, cloud: 90, day: 1 };
      }
      return { temp: 61, feels: 59, code: 3, cloud: 100, day: 0 };
    },
    current: { temp: 61, feels: 59, code: 3, cloud: 100, day: 1 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "The rain already came through.");
  assert.match(briefing.support, /little drizzle around 10am tomorrow/);
});

test("freezing after midnight is named without a clock time", () => {
  const forecast = makeForecast({
    start: "2026-09-22T14:00",
    end: "2026-09-23T06:00",
    now: "2026-09-22T14:45",
    at: (iso) => {
      const hour = Number(iso.slice(11, 13));
      const temp = hour >= 23 || iso.startsWith("2026-09-23") ? 28 : 44;
      return { temp, feels: temp, code: 0, cloud: 0, day: hour >= 7 && hour < 19 ? 1 : 0 };
    },
    current: { temp: 44, feels: 40, code: 0, cloud: 0, day: 1 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.match(briefing.practical, /It freezes overnight/);
  assert.doesNotMatch(briefing.practical, /until about/);
});

test("a long rain names the hour it lasts through", () => {
  const forecast = makeForecast({
    start: "2026-09-22T20:00",
    end: "2026-09-23T20:00",
    now: "2026-09-22T22:45",
    at: (iso) => {
      const hour = Number(iso.slice(11, 13));
      const wet = iso.startsWith("2026-09-22") || hour <= 17;
      if (wet) return { code: 61, pop: 80, amt: 0.04, temp: 8, feels: 6, cloud: 90, day: 0 };
      return { temp: 8, feels: 6, code: 2, cloud: 40, day: 0 };
    },
    current: { temp: 8, feels: 6, code: 61, precip: 0.1, cloud: 90, day: 0 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "Rain is falling now, through about 5pm tomorrow.");
});

test("rain moving off when the last wet hour just ended", () => {
  const forecast = makeForecast({
    start: "2026-09-22T12:00",
    end: "2026-09-22T22:00",
    now: "2026-09-22T16:00",
    at: (iso) => {
      if (iso === "2026-09-22T14:00" || iso === "2026-09-22T15:00") return { code: 61, pop: 80, amt: 0.05, temp: 62, cloud: 100 };
      return { temp: 63, feels: 61, code: 3, cloud: 90 };
    },
    current: { temp: 63, feels: 61, code: 3, cloud: 90, precip: 0 },
  });
  const briefing = composeBriefing(forecast, "imperial");
  assert.equal(briefing.headline, "The rain is moving off.");
});
