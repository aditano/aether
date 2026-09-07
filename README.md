# Aether

A live weather observatory with a cinematic dashboard and a fullscreen radar studio. US views use IEM NEXRAD, GOES, and HRRR. Everywhere else falls back to RainViewer’s global composite.

**Live:** [https://aditano.github.io/aether/](https://aditano.github.io/aether/)

This is not RadarScope. There is no Level-II velocity, storm tracking, or lightning network. It is meant to beat a typical consumer radar on look and on CONUS usefulness, using only public sources and no API keys.

## What it shows

- Immersive radar: dashboard preview plus fullscreen studio (`F` to toggle, `Esc` to leave)
- CONUS reflectivity loops (NEXRAD), 1-hour MRMS precip, GOES satellite, HRRR forecast reflectivity
- Global RainViewer composite outside the US
- Current temperature, feel, condition icons, and a rain-timing line
- Wind rose, UV, humidity, pressure trend, visibility, air quality (AQI + pollutants)
- Next 24 hours, 36-hour chart, and a 10-day outlook
- Sun path, moon phase, NWS alerts with polygons on the map
- City search, geolocation, saved places, °F / °C

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
