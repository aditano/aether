// Sentences for the page, derived from the forecast. No language model.
import {
  aqiBand,
  cardinalName,
  findHourOffset,
  fmtPressure,
  fmtVis,
  hourIndex,
  minutesOf,
  proseTime,
  proseWhen,
  todayDailyIndex,
  uvBand,
  weatherInfo,
} from "./util.js";

function asF(value, units) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return units === "imperial" ? Number(value) : (Number(value) * 9) / 5 + 32;
}

function asMph(value, units) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return units === "imperial" ? Number(value) : Number(value) / 1.60934;
}

function windUnit(units) {
  return units === "imperial" ? "mph" : "km/h";
}

function partOfDay(iso) {
  const h = Number(String(iso).slice(11, 13));
  if (Number.isNaN(h)) return "day";
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

function precipFamily(code) {
  const n = Number(code);
  if (Number.isNaN(n)) return null;
  if (n >= 95) return "storm";
  if ((n >= 71 && n <= 77) || (n >= 85 && n <= 86)) return "snow";
  if (n >= 51 && n <= 57) return "drizzle";
  if ((n >= 61 && n <= 67) || (n >= 80 && n <= 82)) return "rain";
  return null;
}

function precipLevel(pop, amt, code, units) {
  const family = precipFamily(code);
  const popN = Number(pop) || 0;
  const amtN = Number(amt) || 0;
  const trace = units === "imperial" ? 0.01 : 0.25;
  const damp = units === "imperial" ? 0.005 : 0.12;
  if (amtN >= trace || popN >= 60) return "wet";
  if (family && (popN >= 40 || amtN >= damp)) return "wet";
  if (family && amtN > 0) return "sprinkle";
  return "dry";
}

function noun(family) {
  if (family === "storm") return "storms";
  if (family === "snow") return "snow";
  if (family === "drizzle") return "drizzle";
  return "rain";
}

function cap(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function proseAmount(value, units) {
  if (value == null || value <= 0) return null;
  if (units === "imperial") {
    if (value < 0.01) return null;
    if (value < 0.05) return "a few hundredths of an inch";
    if (value < 0.12) return "about a tenth of an inch";
    if (value < 0.2) return "under a quarter of an inch";
    if (value < 0.3) return "about a quarter of an inch";
    if (value < 0.45) return "about a third of an inch";
    if (value < 0.6) return "about a half inch";
    if (value < 0.85) return "about three quarters of an inch";
    if (value < 1.15) return "about an inch";
    if (value < 1.4) return "about an inch and a quarter";
    if (value < 1.7) return "about an inch and a half";
    return `about ${Math.round(value)} inches`;
  }
  if (value < 0.3) return null;
  if (value < 2) return "a millimeter or two";
  return `about ${Math.round(value)} mm`;
}

function collectHours(forecast, idx, units) {
  const hourly = forecast.hourly;
  const start = Math.max(0, idx - 18);
  const end = Math.min(hourly.time.length, idx + 20);
  const hours = [];
  for (let i = start; i < end; i++) {
    const pop = hourly.precipitation_probability?.[i] ?? 0;
    const amt = hourly.precipitation?.[i] ?? 0;
    const code = hourly.weather_code?.[i];
    hours.push({
      i,
      rel: i - idx,
      iso: hourly.time[i],
      temp: hourly.temperature_2m?.[i] ?? null,
      feels: hourly.apparent_temperature?.[i] ?? hourly.temperature_2m?.[i] ?? null,
      pop,
      amt,
      code,
      gust: hourly.wind_gusts_10m?.[i] ?? null,
      wind: hourly.wind_speed_10m?.[i] ?? null,
      dew: hourly.dew_point_2m?.[i] ?? null,
      cloud: hourly.cloud_cover?.[i] ?? null,
      isDay: hourly.is_day?.[i],
      level: precipLevel(pop, amt, code, units),
    });
  }
  return hours;
}

function dominantFamily(spellHours) {
  const score = { storm: 0, snow: 0, rain: 0, drizzle: 0 };
  for (const hour of spellHours) {
    const family = precipFamily(hour.code);
    if (family) score[family] += 2;
    if (!family && (hour.pop || 0) >= 60) score.rain += 1;
  }
  if (score.storm) return "storm";
  if (score.snow && score.snow >= score.rain) return "snow";
  if (score.rain) return "rain";
  if (score.drizzle) return "drizzle";
  return "rain";
}

function spellsOf(hours) {
  const spells = [];
  let cur = null;
  let gap = 0;
  const close = () => {
    if (!cur) return;
    spells.push(cur);
    cur = null;
    gap = 0;
  };
  for (const hour of hours) {
    if (hour.level === "wet") {
      if (!cur) cur = { hours: [hour] };
      else cur.hours.push(hour);
      gap = 0;
    } else if (cur) {
      gap += 1;
      if (gap > 1) close();
    }
  }
  close();
  for (const spell of spells) {
    spell.startRel = spell.hours[0].rel;
    spell.endRel = spell.hours[spell.hours.length - 1].rel;
    spell.family = dominantFamily(spell.hours);
    spell.total = spell.hours.reduce((sum, hour) => sum + (Number(hour.amt) || 0), 0);
  }
  return spells;
}

function spellMatters(spell, units) {
  const trace = units === "imperial" ? 0.01 : 0.25;
  const maxPop = Math.max(...spell.hours.map((hour) => hour.pop || 0));
  if (spell.total >= trace) return true;
  if (maxPop >= 50) return true;
  if (spell.hours.length >= 3 && spell.family !== "drizzle") return true;
  return false;
}

function extremeMoves(hours, nowTemp) {
  const ahead = hours.filter((hour) => hour.rel > 0 && hour.rel <= 16 && hour.temp != null);
  if (!ahead.length || nowTemp == null) return { warm: null, cool: null };
  let max = ahead[0];
  let min = ahead[0];
  for (const hour of ahead) {
    if (hour.temp > max.temp) max = hour;
    if (hour.temp < min.temp) min = hour;
  }
  const warmTemp = Math.round(max.temp);
  const coolTemp = Math.round(min.temp);
  const warmHit = ahead.find((hour) => Math.round(hour.temp) === warmTemp) || max;
  const coolHit = ahead.find((hour) => Math.round(hour.temp) === coolTemp) || min;
  return {
    warm: { delta: max.temp - nowTemp, temp: warmTemp, rel: warmHit.rel, iso: warmHit.iso },
    cool: { delta: nowTemp - min.temp, temp: coolTemp, rel: coolHit.rel, iso: coolHit.iso },
  };
}

function deltaF(delta, units) {
  return units === "imperial" ? delta : delta * (9 / 5);
}

function headlineMove(move, units) {
  if (!move || move.rel <= 1) return null;
  if (deltaF(move.delta, units) < 8) return null;
  return move;
}

function ordinaryOvernight(move, units) {
  const hour = Number(String(move.iso).slice(11, 13));
  const overnight = hour >= 21 || hour <= 7;
  const lowF = units === "imperial" ? move.temp : (move.temp * 9) / 5 + 32;
  return overnight && lowF >= 68;
}

function spellIsMinor(spell, units) {
  if (!spell) return false;
  if (spell.family === "storm" || spell.family === "snow") return false;
  const maxPop = Math.max(...spell.hours.map((hour) => hour.pop || 0));
  if (maxPop >= 70) return false;
  const capAmt = units === "imperial" ? 0.05 : 1.2;
  return spell.total < capAmt && spell.hours.length <= 3;
}

function recentHourDelta(forecast) {
  const prev = findHourOffset(forecast.hourly.time, forecast.current.time, 1);
  if (prev < 0 || forecast.current.temperature_2m == null) return null;
  const then = forecast.hourly.temperature_2m?.[prev];
  if (then == null) return null;
  const delta = forecast.current.temperature_2m - then;
  const n = Math.abs(Math.round(delta));
  if (n < 2) return null;
  return { delta, n };
}

function windChange(hours, gustNow, units) {
  const ahead = hours.filter((hour) => hour.rel >= 2 && hour.rel <= 16 && hour.gust != null);
  if (!ahead.length || gustNow == null) return null;
  const nowMph = asMph(gustNow, units);
  let peak = ahead[0];
  for (const hour of ahead) {
    if ((asMph(hour.gust, units) || 0) > (asMph(peak.gust, units) || 0)) peak = hour;
  }
  const peakMph = asMph(peak.gust, units);
  if (peakMph == null || nowMph == null) return null;
  if (peakMph < 25 || peakMph < nowMph + 8) return null;
  return { gust: Math.round(peak.gust), rel: peak.rel, iso: peak.iso, mph: peakMph };
}

function coverOf(kind, cloud) {
  if (kind === "fog") return "foggy";
  if (cloud != null && cloud >= 85) return "overcast";
  if (kind === "clear" || (cloud != null && cloud < 20)) return "clear";
  if (cloud != null && cloud < 70) return "partly cloudy";
  return "cloudy";
}

function steadyLine(cover, part) {
  if (part === "night") {
    if (cover === "partly cloudy") return "A partly cloudy, quiet night.";
    if (cover === "overcast") return "An overcast, quiet night.";
    return `A ${cover}, quiet night.`;
  }
  if (cover === "partly cloudy") return `Partly cloudy and quiet this ${part}.`;
  const head = cover.charAt(0).toUpperCase() + cover.slice(1);
  return `${head} and quiet this ${part}.`;
}

function leadingAlert(alerts) {
  return (alerts || []).find((alert) => {
    const severity = String(alert.severity || "").toLowerCase();
    return severity === "extreme" || severity === "severe";
  }) || null;
}

function levelRank(level) {
  if (level === "wet") return 2;
  if (level === "sprinkle") return 1;
  return 0;
}

function buildContext(forecast, units, extras) {
  const idx = hourIndex(forecast.hourly.time, forecast.current.time);
  const hours = collectHours(forecast, idx, units);
  const hour0 = hours.find((hour) => hour.rel === 0) || null;
  const current = forecast.current;
  if (hour0) {
    const fromNow = precipLevel(0, current.precipitation, current.weather_code, units);
    if (levelRank(fromNow) > levelRank(hour0.level)) hour0.level = fromNow;
  }
  const nowLevel = hour0?.level || "dry";
  const spells = spellsOf(hours);
  const future = spells.filter((spell) => spell.startRel > 0 && spellMatters(spell, units));
  const realFuture = future.filter((spell) => !spellIsMinor(spell, units));
  const yIndex = findHourOffset(forecast.hourly.time, current.time, 24);
  const yTemp = yIndex >= 0 ? forecast.hourly.temperature_2m?.[yIndex] : null;
  const info = weatherInfo(current.weather_code, current.is_day);
  const moves = extremeMoves(hours, current.temperature_2m);
  return {
    forecast,
    units,
    hours,
    hour0,
    nowLevel,
    nowSpell: spells.find((spell) => spell.startRel <= 0 && spell.endRel >= 0) || null,
    nextSpell: realFuture[0] || null,
    laterSpell: realFuture[1] || null,
    minorSpell: future.find((spell) => spellIsMinor(spell, units)) || null,
    pastSpell: [...spells].reverse().find((spell) => spell.endRel < 0 && spell.endRel >= -16 && spellMatters(spell, units) && !spellIsMinor(spell, units)) || null,
    hourDelta: recentHourDelta(forecast),
    warm: moves.warm,
    cool: moves.cool,
    windUp: windChange(hours, current.wind_gusts_10m ?? hour0?.gust, units),
    yesterday: yTemp == null || current.temperature_2m == null ? null : { delta: current.temperature_2m - yTemp, then: yTemp },
    info,
    kind: info.kind,
    cloud: current.cloud_cover ?? hour0?.cloud ?? null,
    part: partOfDay(current.time),
    alert: leadingAlert(extras.alerts),
    dayIdx: todayDailyIndex(forecast),
    air: extras.air || null,
    feels: current.apparent_temperature,
    temp: current.temperature_2m,
  };
}

function windNow(ctx) {
  const gust = asMph(ctx.forecast.current.wind_gusts_10m, ctx.units);
  const speed = asMph(ctx.forecast.current.wind_speed_10m, ctx.units);
  return (gust != null && gust >= 30) || (speed != null && speed >= 22);
}

function selectStory(ctx) {
  if (ctx.alert) return { type: "alert" };
  if (ctx.nowLevel === "wet") return { type: "precip-now" };
  if (ctx.nextSpell) return { type: "precip-soon" };
  if (ctx.hourDelta && ctx.hourDelta.n >= 8) return { type: "jump" };
  if (ctx.pastSpell) return { type: "precip-past" };
  const warm = headlineMove(ctx.warm, ctx.units);
  const coolMove = headlineMove(ctx.cool, ctx.units);
  const cool = coolMove && !ordinaryOvernight(coolMove, ctx.units) ? coolMove : null;
  if (warm && cool && Math.abs(warm.rel - cool.rel) >= 3) {
    return warm.rel < cool.rel
      ? { type: "swing", first: { ...warm, dir: "up" }, second: { ...cool, dir: "down" } }
      : { type: "swing", first: { ...cool, dir: "down" }, second: { ...warm, dir: "up" } };
  }
  if (warm && (!cool || warm.delta >= cool.delta)) return { type: "warming", move: warm };
  if (cool) return { type: "cooling", move: cool };
  if (ctx.yesterday && Math.abs(deltaF(ctx.yesterday.delta, ctx.units)) >= 8) return { type: "yesterday" };
  if (ctx.windUp && ctx.windUp.mph >= 28) return { type: "wind-up" };
  if (ctx.yesterday && Math.abs(deltaF(ctx.yesterday.delta, ctx.units)) >= 6) return { type: "yesterday" };
  if (ctx.minorSpell) return { type: "minor" };
  if (windNow(ctx)) return { type: "wind-now" };
  if (ctx.nowLevel === "sprinkle") return { type: "sprinkle" };
  return { type: "steady" };
}

function precipNowHeadline(spell, hours, nowIso) {
  const family = spell?.family || "rain";
  const lead = family === "storm" ? "Storms are here now" : `${cap(noun(family))} is falling now`;
  if (!spell) return `${lead}.`;
  const after = hours.find((hour) => hour.rel > spell.endRel && hour.level !== "wet");
  if (spell.hours.length <= 3 && after) {
    return `${lead}, and should ease around ${proseWhen(after.iso, nowIso)}.`;
  }
  if (spell.hours.length >= 6) {
    const end = spell.hours[spell.hours.length - 1];
    return `${lead}, through about ${proseWhen(end.iso, nowIso)}.`;
  }
  return `${lead}.`;
}

function precipSoonHeadline(spell, nowIso, units) {
  const when = proseWhen(spell.hours[0].iso, nowIso);
  const endWhen = proseWhen(spell.hours[spell.hours.length - 1].iso, nowIso);
  const amt = proseAmount(spell.total, units);
  const tail = amt ? `, ${amt}` : "";
  const family = spell.family;
  if (spell.hours.length <= 2) {
    if (family === "storm") return `A brief storm around ${when}${tail}.`;
    if (family === "snow") return `Snow around ${when}${tail}.`;
    if (family === "drizzle") return `Drizzle around ${when}${tail}.`;
    return `A shower around ${when}${tail}.`;
  }
  if (spell.hours.length <= 5) {
    if (family === "storm") return `Storms arrive around ${when} and last a few hours${tail}.`;
    return `${cap(noun(family))} arrives around ${when} and lasts a few hours${tail}.`;
  }
  if (family === "storm") return `Storms set in around ${when} and hang on past ${endWhen}${tail}.`;
  return `${cap(noun(family))} sets in around ${when} and hangs on past ${endWhen}${tail}.`;
}

function precipPastHeadline(spell) {
  const name = noun(spell.family);
  if (spell.endRel >= -2) {
    if (spell.family === "storm") return "The storms are moving off.";
    if (spell.family === "snow") return "The snow is moving off.";
    return `The ${name} is moving off.`;
  }
  if (spell.family === "storm") return "The storms already came through.";
  if (spell.family === "snow") return "The snow already came through.";
  return `The ${name} already came through.`;
}

function yesterdayHeadline(delta) {
  const n = Math.abs(Math.round(delta));
  return `${n}° ${delta > 0 ? "warmer" : "cooler"} than yesterday at this hour.`;
}

function headlineFor(story, ctx) {
  const nowIso = ctx.forecast.current.time;
  switch (story.type) {
    case "alert":
      return `${ctx.alert.event} is in effect.`;
    case "precip-now":
      return precipNowHeadline(ctx.nowSpell, ctx.hours, nowIso);
    case "precip-soon":
      return precipSoonHeadline(ctx.nextSpell, nowIso, ctx.units);
    case "precip-past":
      return precipPastHeadline(ctx.pastSpell);
    case "jump":
      return `${ctx.hourDelta.delta < 0 ? "Down" : "Up"} ${ctx.hourDelta.n}° in the last hour.`;
    case "minor":
      return minorLine(ctx.minorSpell, nowIso);
    case "swing": {
      const verb = (move) => (move.dir === "up" ? "warms to" : "falls to");
      return `It ${verb(story.first)} ${story.first.temp}° by ${proseWhen(story.first.iso, nowIso)}, then ${verb(story.second)} ${story.second.temp}° by ${proseWhen(story.second.iso, nowIso)}.`;
    }
    case "warming":
      return `It warms to ${story.move.temp}° by ${proseWhen(story.move.iso, nowIso)}.`;
    case "cooling":
      return `It falls to ${story.move.temp}° by ${proseWhen(story.move.iso, nowIso)}.`;
    case "yesterday":
      return yesterdayHeadline(ctx.yesterday.delta);
    case "wind-up":
      return `Gusts climb toward ${ctx.windUp.gust} ${windUnit(ctx.units)} around ${proseWhen(ctx.windUp.iso, nowIso)}.`;
    case "wind-now": {
      const gust = ctx.forecast.current.wind_gusts_10m;
      const speed = ctx.forecast.current.wind_speed_10m;
      const dir = cardinalName(ctx.forecast.current.wind_direction_10m);
      const from = dir ? ` out of the ${dir}` : "";
      const unit = windUnit(ctx.units);
      if ((asMph(gust, ctx.units) || 0) >= 30) return `Gusts near ${Math.round(gust)} ${unit}${from}.`;
      return `A steady wind near ${Math.round(speed)} ${unit}${from}.`;
    }
    case "sprinkle":
      return "A light sprinkle, with very little water in it.";
    case "steady":
      return steadyLine(coverOf(ctx.kind, ctx.cloud), ctx.part);
    default: {
      const unknown = story.type;
      throw new Error(`Unhandled story: ${unknown}`);
    }
  }
}

function minorLine(spell, nowIso) {
  const when = proseWhen(spell.hours[0].iso, nowIso);
  if (spell.family === "snow") return `A little snow around ${when}.`;
  if (spell.family === "drizzle") return `A little drizzle around ${when}.`;
  return `A light shower around ${when}.`;
}

function dryClaim(ctx) {
  const ahead = ctx.hours.filter((hour) => hour.rel >= 0 && hour.rel <= 12);
  if (!ahead.length || ahead.some((hour) => hour.level === "wet")) return null;
  const night = ctx.part === "evening" || ctx.part === "night";
  const lead = night ? "The night stays dry" : "The rest of the day stays dry";
  if (ahead.some((hour) => hour.level === "sprinkle")) return `${lead}, with a sprinkle possible.`;
  return `${lead}.`;
}

function amountLead(spell, units, dry) {
  const amt = proseAmount(spell?.total, units);
  if (amt && dry) return `${cap(amt)}, and ${dry.charAt(0).toLowerCase()}${dry.slice(1)}`;
  if (amt) return `${cap(amt)}.`;
  return dry;
}

function tempSentence(move, nowIso) {
  if (!move) return null;
  const verb = move.dir === "up" ? "warms to" : "falls to";
  return `It ${verb} ${move.temp}° by ${proseWhen(move.iso, nowIso)}.`;
}

function unspokenTemp(story, ctx, nowIso) {
  if (story.type === "swing") return null;
  if (story.type === "warming" && ctx.cool && ctx.cool.delta >= 8 && ctx.cool.rel > story.move.rel + 2) {
    return tempSentence({ ...ctx.cool, dir: "down" }, nowIso);
  }
  if (story.type === "cooling" && ctx.warm && ctx.warm.delta >= 8 && ctx.warm.rel > story.move.rel + 2) {
    return tempSentence({ ...ctx.warm, dir: "up" }, nowIso);
  }
  if (story.type === "warming" || story.type === "cooling") return null;
  const warm = ctx.warm && ctx.warm.delta >= 5 && ctx.warm.rel > 1 ? { ...ctx.warm, dir: "up" } : null;
  const cool = ctx.cool && ctx.cool.delta >= 5 && ctx.cool.rel > 1 ? { ...ctx.cool, dir: "down" } : null;
  if (warm && cool) return tempSentence(warm.delta >= cool.delta ? warm : cool, nowIso);
  return tempSentence(warm || cool, nowIso);
}

function supportFor(story, ctx) {
  const nowIso = ctx.forecast.current.time;
  const lines = [];
  const push = (line) => {
    if (line && lines.length < 2) lines.push(line);
  };
  if (story.type === "precip-past") push(amountLead(ctx.pastSpell, ctx.units, dryClaim(ctx)));
  if (story.type === "precip-now" && ctx.nowSpell) {
    const amt = proseAmount(ctx.nowSpell.total, ctx.units);
    if (amt) push(`${cap(amt)} in this round.`);
  }
  if (story.type === "precip-soon" && ctx.pastSpell) {
    const family = ctx.pastSpell.family;
    if (family === "snow") push("Snow already came through earlier.");
    else if (family === "storm") push("Storms already came through earlier.");
    else if (family === "drizzle") push("Drizzle already came through earlier.");
    else push("It already rained earlier.");
  }
  if (story.type === "precip-soon" && ctx.laterSpell) {
    push(`Another round around ${proseWhen(ctx.laterSpell.hours[0].iso, nowIso)}.`);
  }
  if (story.type !== "minor" && ctx.minorSpell) push(minorLine(ctx.minorSpell, nowIso));
  if (story.type !== "wind-up" && story.type !== "wind-now" && ctx.windUp) {
    push(`Gusts climb toward ${ctx.windUp.gust} ${windUnit(ctx.units)} around ${proseWhen(ctx.windUp.iso, nowIso)}.`);
  }
  push(unspokenTemp(story, ctx, nowIso));
  if (story.type !== "yesterday" && ctx.yesterday && Math.abs(deltaF(ctx.yesterday.delta, ctx.units)) >= 5) {
    push(yesterdayHeadline(ctx.yesterday.delta));
  }
  if (!lines.length && story.type !== "steady" && story.type !== "alert") {
    push(steadyLine(coverOf(ctx.kind, ctx.cloud), ctx.part));
  }
  return lines.join(" ");
}

function garment(feelsF) {
  if (feelsF == null) return null;
  if (feelsF < 15) return { id: "hard", now: "Hard cold. Cover up.", next: "hard cold" };
  if (feelsF < 32) return { id: "freeze", now: "Freezing weather.", next: "freezing weather" };
  if (feelsF < 45) return { id: "coat", now: "Coat weather.", next: "coat weather" };
  if (feelsF < 55) return { id: "jacket", now: "Jacket weather.", next: "jacket weather" };
  if (feelsF < 66) return { id: "light", now: "A light jacket will do.", next: "a light jacket" };
  if (feelsF < 76) return { id: "sleeves", now: "Shirt sleeves.", next: "shirt sleeves" };
  if (feelsF < 88) return { id: "clothes", now: "Light clothes.", next: "light clothes" };
  return { id: "heat", now: "Dress for heat.", next: "dress for heat" };
}

function garmentChange(hours, feelsNow, units) {
  const nowF = asF(feelsNow, units);
  const current = garment(nowF);
  if (!current || current.id === "hard") return null;
  const ahead = hours.filter((hour) => hour.rel >= 2 && hour.rel <= 10 && hour.feels != null);
  let best = null;
  for (const hour of ahead) {
    const feelsF = asF(hour.feels, units);
    const next = garment(feelsF);
    if (!next || next.id === current.id || Math.abs(feelsF - nowF) < 8) continue;
    const clock = Number(String(hour.iso).slice(11, 13));
    const quiet = clock >= 23 || clock < 6;
    if (quiet && next.id !== "freeze" && next.id !== "hard") continue;
    best = { garment: next, rel: hour.rel, iso: hour.iso, quiet };
  }
  return best;
}

function practicalFor(story, ctx) {
  const feelsF = asF(ctx.feels ?? ctx.temp, ctx.units);
  const current = garment(feelsF);
  if (!current) return "";
  const nowIso = ctx.forecast.current.time;
  let line = current.now;
  if (current.id !== "hard") {
    const change = garmentChange(ctx.hours, ctx.feels ?? ctx.temp, ctx.units);
    const precip = practicalPrecip(story, ctx, nowIso);
    const rainSoon = precip && !precip.now && precip.rel <= 8;
    if (change && !rainSoon) {
      if (change.quiet) line = `${current.now.replace(/\.$/, "")}. It freezes overnight.`;
      else line = `${current.now.replace(/\.$/, "")} until about ${proseWhen(change.iso, nowIso)}, then ${change.garment.next}.`;
    }
    if (precip?.now) line = `${cap(precip.noun)} now. ${current.now}`;
    else if (rainSoon) line = `${current.now.replace(/\.$/, "")}, and ${precip.noun} around ${precip.when}.`;
  }
  const uv = ctx.forecast.current.uv_index;
  const shade = current.id === "heat" && ctx.forecast.current.is_day && (ctx.part === "morning" || ctx.part === "afternoon") && (uv == null || uv >= 4);
  if (shade && !line.includes("Find shade")) {
    if (!line.endsWith(".")) line += ".";
    line += " Find shade.";
  }
  const aqi = ctx.air?.usAqi;
  if (aqi != null && aqi >= 151) return `The air is unhealthy. ${line}`;
  return line;
}

function practicalPrecip(story, ctx, nowIso) {
  if (story.type === "precip-now" || ctx.nowLevel === "wet") {
    const family = ctx.nowSpell?.family || precipFamily(ctx.forecast.current.weather_code) || "rain";
    return { now: true, noun: noun(family), rel: 0 };
  }
  if (story.type === "precip-soon" && ctx.nextSpell) {
    return {
      now: false,
      noun: noun(ctx.nextSpell.family),
      rel: ctx.nextSpell.startRel,
      when: proseWhen(ctx.nextSpell.hours[0].iso, nowIso),
    };
  }
  if (ctx.nowLevel === "sprinkle") return { now: true, noun: "drizzle", rel: 0 };
  return null;
}

function hourChange(ctx, story) {
  if (!ctx.hourDelta || story.type === "jump") return null;
  return `${ctx.hourDelta.delta > 0 ? "up" : "down"} ${ctx.hourDelta.n}° this hour`;
}

function windGloss(ctx) {
  const speed = asMph(ctx.forecast.current.wind_speed_10m, ctx.units);
  const gust = asMph(ctx.forecast.current.wind_gusts_10m, ctx.units);
  if (speed == null) return "";
  if (speed < 3 && (gust == null || gust < 8)) return "Nearly calm.";
  if (gust != null && gust - speed >= 10 && gust >= 18) return "Gusty rather than steady.";
  if (speed >= 20) return "Strong enough to notice on a walk.";
  return "";
}

function airRow(ctx) {
  const dew = ctx.forecast.current.dew_point_2m ?? ctx.hour0?.dew ?? null;
  const rh = ctx.forecast.current.relative_humidity_2m;
  if (dew == null && rh == null) return null;
  const dewF = asF(dew, ctx.units);
  let gloss = "";
  if (dewF != null) {
    if (dewF < 50) gloss = "Crisp air.";
    else if (dewF < 60) gloss = "Comfortable, not sticky.";
    else if (dewF < 65) gloss = "A little humid.";
    else if (dewF < 70) gloss = "Humid.";
    else if (dewF < 75) gloss = "Heavy, sticky air.";
    else gloss = "Oppressive humidity.";
  }
  return {
    id: "air",
    label: "Air",
    value: dew == null ? `${Math.round(rh)}%` : `${Math.round(dew)}°`,
    note: dew == null ? "humidity" : `dew point${rh == null ? "" : ` · ${Math.round(rh)}% humidity`}`,
    gloss,
  };
}

function pressureRow(ctx) {
  const now = ctx.forecast.current.pressure_msl;
  if (now == null) return null;
  const shown = fmtPressure(now, ctx.units);
  const prevIdx = findHourOffset(ctx.forecast.hourly.time, ctx.forecast.current.time, 3);
  const prev = prevIdx >= 0 ? ctx.forecast.hourly.pressure_msl?.[prevIdx] : null;
  let gloss = "Steady over the last few hours.";
  if (prev != null && Math.abs(now - prev) >= 1.2) {
    const up = now > prev;
    gloss = ctx.units === "imperial"
      ? `${up ? "Up" : "Down"} ${Math.abs((now - prev) * 0.02953).toFixed(2)} inHg in three hours.`
      : `${up ? "Up" : "Down"} ${Math.round(Math.abs(now - prev))} hPa in three hours.`;
  }
  return { id: "pressure", label: "Pressure", value: shown.value, note: shown.unit, gloss };
}

function visReach(vis, units) {
  if (vis == null || Number.isNaN(Number(vis))) return null;
  return units === "imperial" ? Number(vis) / 5280 : Number(vis) / 1000;
}

function skyName(ctx) {
  if (ctx.kind === "fog") return "Fog";
  if (ctx.cloud != null && ctx.cloud >= 85) return "Overcast";
  if (ctx.kind === "clear" || (ctx.cloud != null && ctx.cloud < 20)) return "Clear";
  if (ctx.cloud != null && ctx.cloud < 70) return "Partly cloudy";
  return ctx.info?.label || "Cloudy";
}

function lightFact(ctx) {
  const daily = ctx.forecast.daily;
  if (!daily?.sunrise || !daily?.sunset) return null;
  const nowIso = ctx.forecast.current.time;
  const nowM = minutesOf(nowIso);
  const today = String(daily.time?.[ctx.dayIdx] || "").slice(0, 10);
  const rise = daily.sunrise[ctx.dayIdx];
  const set = daily.sunset[ctx.dayIdx];
  const nextRise = daily.sunrise[ctx.dayIdx + 1];
  if (nowM == null || !today || String(nowIso).slice(0, 10) !== today) {
    return nextRise ? { kind: "later", at: nextRise } : null;
  }
  if (set && minutesOf(set) != null && nowM < minutesOf(set)) {
    return { kind: "sunset", at: set, left: minutesOf(set) - nowM };
  }
  if (rise && minutesOf(rise) != null && nowM < minutesOf(rise)) {
    return { kind: "sunrise", at: rise };
  }
  if (nextRise) return { kind: "later", at: nextRise };
  return null;
}

function skyRow(ctx) {
  const light = lightFact(ctx);
  const reach = visReach(ctx.forecast.current.visibility, ctx.units);
  const vis = fmtVis(ctx.forecast.current.visibility, ctx.units);
  const name = skyName(ctx);
  if (reach != null && reach < 3) {
    return { id: "sky", label: "Sky", value: `${vis.value} ${vis.unit}`.trim(), note: name.toLowerCase(), gloss: "Visibility is short." };
  }
  if (light?.kind === "sunset" && light.left <= 90) {
    return { id: "sky", label: "Sky", value: `${light.left} min`, note: "of light left", gloss: `${name}. Sets at ${proseTime(light.at)}.` };
  }
  const uv = ctx.forecast.current.uv_index;
  if (ctx.forecast.current.is_day && uv != null && uv >= 6) {
    return { id: "sky", label: "Sky", value: `UV ${Math.round(uv)}`, note: uvBand(uv).label, gloss: name };
  }
  let gloss = "";
  if (light?.kind === "sunset") gloss = `Light until ${proseTime(light.at)}.`;
  else if (light?.kind === "sunrise") gloss = `Light around ${proseTime(light.at)}.`;
  else if (light?.kind === "later") gloss = `Light again at ${proseTime(light.at)}.`;
  const note = reach != null && reach < 10 ? `${vis.value} ${vis.unit}`.trim() : "";
  return { id: "sky", label: "Sky", value: name, note, gloss };
}

function yesterdayRow(ctx, story) {
  if (!ctx.yesterday || Math.abs(ctx.yesterday.delta) < 2) return null;
  const then = `${Math.round(ctx.yesterday.then)}°`;
  if (story.type === "yesterday") {
    return { id: "yesterday", label: "Yesterday", value: then, note: "at this hour", gloss: "" };
  }
  const n = Math.abs(Math.round(ctx.yesterday.delta));
  const dir = ctx.yesterday.delta > 0 ? "warmer" : "cooler";
  return { id: "yesterday", label: "Yesterday", value: `${n}° ${dir}`, note: "than yesterday at this hour", gloss: `It was ${then} then.` };
}

function qualityRow(air) {
  if (!air || air.usAqi == null) return null;
  const meta = aqiBand(air.usAqi);
  const bits = [
    air.pm25 != null ? `PM2.5 ${Math.round(air.pm25)}` : null,
    air.ozone != null ? `ozone ${Math.round(air.ozone)}` : null,
    air.no2 != null ? `NO₂ ${Math.round(air.no2)}` : null,
  ].filter(Boolean);
  return { id: "aqi", label: "Air quality", value: String(Math.round(air.usAqi)), note: meta.label, gloss: bits.join(" · ") };
}

function heatBand(maxF) {
  if (maxF >= 93) return "hot";
  if (maxF >= 82) return "warm";
  if (maxF >= 70) return "mild";
  if (maxF >= 55) return "cool";
  if (maxF >= 40) return "cold";
  return "bitter";
}

const HEAT_WORD = { hot: "Hot", warm: "Warm", mild: "Mild", cool: "Cool", cold: "Cold", bitter: "Bitter" };

function weekdayLong(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

function relDayName(iso, todayIso) {
  const day = String(iso).slice(0, 10);
  const today = String(todayIso).slice(0, 10);
  if (day === today) return "today";
  const [y, m, d] = today.split("-").map(Number);
  if (!y) return weekdayLong(day);
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  if (day === tomorrow) return "tomorrow";
  return weekdayLong(day);
}

function phraseFor(regime, contrast) {
  const heat = HEAT_WORD[regime.heat] || "Mild";
  if (regime.sky === "snow") return "Snow";
  if (regime.sky === "storm") return `${heat}, with storms`;
  if (regime.sky === "wet") return `${heat}, with rain`;
  if (contrast) return `${heat} and dry`;
  return heat;
}

function whenClause(run) {
  const { count, startName, endName } = run;
  if (count === 1) {
    if (startName === "today" || startName === "tomorrow") return startName;
    return `on ${startName}`;
  }
  if (count === 2) {
    if (startName === "today") return `today and ${endName}`;
    if (startName === "tomorrow") return `tomorrow and ${endName}`;
    return `${startName} and ${endName}`;
  }
  if (startName === "today") return `through ${endName}`;
  if (startName === "tomorrow") return `tomorrow through ${endName}`;
  return `${startName} through ${endName}`;
}

function weekStory(forecast, units) {
  const daily = forecast.daily;
  if (!daily?.time?.length) return "";
  const start = todayDailyIndex(forecast);
  const todayIso = forecast.current.time;
  const days = [];
  for (let i = start; i < Math.min(daily.time.length, start + 8); i++) {
    const maxF = asF(daily.temperature_2m_max?.[i], units);
    if (maxF == null) continue;
    const kind = weatherInfo(daily.weather_code?.[i], 1).kind;
    const trace = units === "imperial" ? 0.1 : 2.5;
    const wet = (daily.precipitation_probability_max?.[i] ?? 0) >= 50 || (daily.precipitation_sum?.[i] ?? 0) >= trace;
    let sky = "dry";
    if (kind === "storm") sky = "storm";
    else if (kind === "snow") sky = "snow";
    else if (wet) sky = "wet";
    days.push({
      name: relDayName(daily.time[i], todayIso),
      regime: { heat: heatBand(maxF), sky },
    });
  }
  if (!days.length) return "";
  const runs = [];
  for (const day of days) {
    const key = `${day.regime.heat}-${day.regime.sky}`;
    const last = runs[runs.length - 1];
    if (!last || last.key !== key) runs.push({ key, regime: day.regime, startName: day.name, endName: day.name, count: 1 });
    else {
      last.endName = day.name;
      last.count += 1;
    }
  }
  const contrast = runs.some((run) => run.regime.sky !== "dry");
  const shown = runs.slice(0, 4);
  const pieces = shown.map((run) => `${phraseFor(run.regime, contrast)} ${whenClause(run)}`);
  let text = pieces[0];
  for (let i = 1; i < pieces.length; i++) text += `, then ${pieces[i].charAt(0).toLowerCase()}${pieces[i].slice(1)}`;
  return `${text}.`;
}

export function composeBriefing(forecast, units, extras = {}) {
  if (!forecast?.current || !forecast?.hourly?.time?.length) {
    return {
      headline: "The forecast came back thin.",
      support: "",
      practical: "",
      hourNote: null,
      week: "",
      windGloss: "",
      rows: [],
    };
  }
  const ctx = buildContext(forecast, units, extras);
  const selected = selectStory(ctx);
  let story = selected;
  let headline;
  let support;
  let practical;
  if (selected.type === "alert") {
    const inner = selectStory({ ...ctx, alert: null });
    headline = `${ctx.alert.event} is in effect.`;
    support = [headlineFor(inner, ctx), supportFor(inner, ctx)].filter(Boolean).join(" ");
    practical = "See the alert above before you go out.";
    story = { type: "alert" };
  } else {
    headline = headlineFor(selected, ctx);
    support = supportFor(selected, ctx);
    practical = practicalFor(selected, ctx);
  }
  const quality = qualityRow(ctx.air);
  const rows = [];
  if (quality && ctx.air.usAqi >= 100) rows.push(quality);
  for (const row of [airRow(ctx), pressureRow(ctx), skyRow(ctx), yesterdayRow(ctx, story)]) {
    if (row) rows.push(row);
  }
  if (quality && ctx.air.usAqi < 100) rows.push(quality);
  return {
    headline,
    support,
    practical,
    hourNote: hourChange(ctx, story),
    week: weekStory(forecast, units),
    windGloss: windGloss(ctx),
    rows,
  };
}
