# Aether

A live weather observatory. Radar, wind, UV, humidity, air quality, and a 10-day forecast — all from public sources. No API keys.

**Live:** [https://aditano.github.io/aether/](https://aditano.github.io/aether/)

## What it shows

- Current temperature, feel, and condition
- Animated precipitation radar (RainViewer) plus infrared satellite
- Wind rose with direction, speed, and gusts
- UV index, humidity, dew point, pressure trend, visibility, cloud cover
- US air quality when Open-Meteo publishes it
- Next 24 hours and a 10-day outlook
- Temperature / precip chart, sun path, and moon phase
- NWS alerts for US locations
- City search, geolocation, saved places, °F / °C

## Sources

- [Open-Meteo](https://open-meteo.com) — forecast, geocoding, air quality
- [National Weather Service](https://www.weather.gov) — US fallback forecast and alerts
- [RainViewer](https://www.rainviewer.com/api.html) — radar and satellite tiles
- [OpenStreetMap](https://www.openstreetmap.org) / [CARTO](https://carto.com) — basemap

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
```

Saved places and unit preference stay in `localStorage`.
