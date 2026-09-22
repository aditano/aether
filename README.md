# Aether

A weather observatory. The page opens with a briefing written from the forecast on this device, then a full-width radar and a 24-hour arc of the sky. US views use IEM NEXRAD, GOES, and HRRR. Everywhere else falls back to RainViewer’s global composite.

**Live:** [https://aditano.github.io/aether/](https://aditano.github.io/aether/)

This is not RadarScope. There is no Level-II velocity, storm tracking, or lightning network. It is meant to beat a typical consumer radar on look and on CONUS usefulness, using only public sources and no API keys.

## What it shows

- A place-specific briefing: what is happening, what is left of the day, and what to wear. Calculated in the browser from the forecast, with no language model
- Full-width radar, plus a fullscreen studio (`F` to toggle, `Esc` to leave)
- CONUS reflectivity loops (NEXRAD), 1-hour MRMS precip, GOES satellite, HRRR forecast reflectivity
- Global RainViewer composite outside the US
- A 24-hour arc: sky color, temperature, chance of precip, sunrise and sunset
- Wind rose and a short instrument log (dew point, pressure, sky, yesterday, air quality)
- A week sentence, a 10-day list, and the moon
- NWS alerts, with severe and extreme alerts taking the headline
- On open, the browser’s location. A city you search for stays until you use the location button again. Radnor is the fallback when the browser will not share a location
- City search, saved places, °F / °C

## Sources

- [Open-Meteo](https://open-meteo.com) — forecast, geocoding, air quality
- [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu) — NEXRAD, MRMS, GOES, HRRR tiles
- [National Weather Service](https://www.weather.gov) — US alerts and fallback forecast
- [RainViewer](https://www.rainviewer.com/api.html) — global radar outside CONUS
- [OpenFreeMap](https://openfreemap.org) / OSM — dark vector basemap

## Run locally

Serve the folder (ES modules will not load from `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Saved places and unit preference stay in `localStorage`.
