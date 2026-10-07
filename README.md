# Aether

Aether is a weather observatory that runs in the browser. The page opens with a short briefing written from the forecast on this device, then a live radar and a 24-hour picture of the sky. That briefing is calculated here. There is no language model and no API key.

**Live:** [https://aditano.github.io/aether/](https://aditano.github.io/aether/)

GitHub Actions deploys the site from `main` to GitHub Pages.

## Features

- A briefing with a headline, a support line, and a practical note about clothing or the next wet spell. Severe and extreme National Weather Service alerts take the headline.
- On a first visit, the browser's location. A city you search for stays until you use the location button again. If the browser will not share a location, the page opens on Radnor, Pennsylvania.
- City search, up to eight saved places, and a °F / °C switch. Press `/` to focus search.
- A full-width radar you can play, scrub, fade, and run at ½×, 1×, or 2×. Press `F` for a fullscreen studio, and `Esc` to leave it.
- Inside the contiguous United States: NEXRAD reflectivity, one-hour MRMS precipitation, GOES satellite (visible by day, infrared at night), and an HRRR reflectivity forecast.
- Outside that area: RainViewer's global composite, with a snow overlay toggle.
- A 24-hour arc of sky color, temperature, and chance of precipitation, with sunrise and sunset. Hover or focus a column for that hour.
- A wind rose, plus readings for dew point and humidity, pressure, sky and light, yesterday at this hour, and US air quality when those fields come back.
- One sentence for the week, a 10-day list, and the moon phase.
- A silent refresh every five minutes. If Open-Meteo fails, the forecast falls back to the National Weather Service with fewer fields.
- Layouts for phone and tablet widths. Reduced motion keeps the radar loop from autoplaying.

## Run locally

ES modules will not load from `file://`. Serve this folder:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

Saved places, the unit choice, and radar opacity, speed, and snow preference stay in `localStorage`.

Unit tests use Node's built-in runner:

```bash
node --test
```

## Tech stack

- Static HTML, CSS, and JavaScript ES modules. No bundler and no framework.
- [Leaflet](https://leafletjs.com/) 1.9.4 for the map.
- [MapLibre GL JS](https://maplibre.org/) 4.7.1 and [@maplibre/maplibre-gl-leaflet](https://github.com/maplibre/maplibre-gl-leaflet) 0.1.0 for the dark [OpenFreeMap](https://openfreemap.org/) vector basemap.
- [Figtree](https://github.com/erikdkennedy/figtree), [Fraunces](https://github.com/undercasetype/Fraunces), and [IBM Plex Mono](https://github.com/IBM/plex), loaded from Google Fonts.
- GitHub Actions (`.github/workflows/pages.yml`) publishes the site to GitHub Pages.

## Sources

- [Open-Meteo](https://open-meteo.com): forecast, air quality, and city search
- [BigDataCloud](https://www.bigdatacloud.com/reverse-geocoding): place name for the browser's location
- [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu): NEXRAD, MRMS, GOES, and HRRR tiles
- [National Weather Service](https://www.weather.gov): US alerts and fallback forecast
- [RainViewer](https://www.rainviewer.com/api.html): global radar outside the contiguous United States
- [OpenFreeMap](https://openfreemap.org) and OpenStreetMap: basemap

## License

Copyright 2026 Anthony DiTano.

Aether's own code is released under the GNU General Public License, version 3 or any later version (`GPL-3.0-or-later`). The full license text is in [LICENSE](LICENSE).

Third-party code and fonts keep their own licenses. They are loaded at runtime and are not relicensed under the GPL:

- Leaflet 1.9.4, from unpkg: BSD-2-Clause
- MapLibre GL JS 4.7.1, from unpkg: BSD-3-Clause
- @maplibre/maplibre-gl-leaflet 0.1.0, from unpkg: ISC
- Figtree, Fraunces, and IBM Plex Mono, from Google Fonts: SIL Open Font License 1.1

Forecasts, alerts, radar tiles, and map data stay under the terms of the services that publish them.
