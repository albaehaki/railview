import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://tiles.openfreemap.org/styles/dark";
const PUSAT = [106.86, -6.22];

export function createMap(el, { onTrain } = {}) {
  const q = new URLSearchParams(location.search);
  const viewZoom = Number(q.get("z")) || 9.2;
  const viewPusat = [Number(q.get("lng")) || PUSAT[0], Number(q.get("lat")) || PUSAT[1]];
  const map = new maplibregl.Map({
    container: el,
    style: STYLE,
    center: viewPusat,
    zoom: viewZoom,
    pitch: 55,
    bearing: -17,
    attributionControl: false,
    preserveDrawingBuffer: true,
    maxPitch: 75,
  });

  map.on("error", (e) => console.error("MAPERR", e?.error?.message || e?.error || e));

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: "Data kereta: 168railway · Peta: OpenFreeMap / OpenStreetMap",
    })
  );

  const exprWarna = (c) => [
    "step",
    ["coalesce", ["get", "render_height"], ["get", "height"], 10],
    c.low, 12, c.mid, 30, c.high,
  ];
  let warnaGedung = exprWarna({ low: "#252d20", mid: "#2f3728", high: "#3a4432" });
  let siap = false;
  const antre = { trains: null, stations: null, jalur: null };

  map.on("load", () => {
    /* gedung 3D */
    map.addLayer({
      id: "gedung-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-extrusion-color": warnaGedung,
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 10],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
      },
    });

    /* stasiun */
    map.addSource("stasiun", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "stasiun-titik",
      type: "circle",
      source: "stasiun",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 13, 4],
        "circle-color": "#e6ece1",
        "circle-stroke-color": "#0b0f0b",
        "circle-stroke-width": 1,
      },
    });
    map.addLayer({
      id: "stasiun-nama",
      type: "symbol",
      source: "stasiun",
      minzoom: 10.4,
      layout: {
        "text-field": ["get", "nama"],
        "text-size": 10,
        "text-offset": [0, 0.9],
        "text-anchor": "top",
        "text-font": ["Noto Sans Regular"],
      },
      paint: { "text-color": "#c9d3c4", "text-halo-color": "#060906", "text-halo-width": 1.4 },
    });

    /* kereta */
    map.addSource("kereta", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "kereta-halo",
      type: "circle",
      source: "kereta",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 13, 12],
        "circle-color": ["match", ["get", "tipe"], 1, "#d9a24b", 2, "#58a874", "#e6ece1"],
        "circle-opacity": 0.16,
      },
    });
    map.addLayer({
      id: "kereta-titik",
      type: "circle",
      source: "kereta",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3.6, 13, 6],
        "circle-color": ["match", ["get", "tipe"], 1, "#d9a24b", 2, "#58a874", "#e6ece1"],
        "circle-stroke-color": "#050705",
        "circle-stroke-width": 0.8,
      },
    });

    /* jalur kereta terpilih */
    map.addSource("jalur", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "jalur-garis",
      type: "line",
      source: "jalur",
      paint: { "line-color": "#d9a24b", "line-width": 2.4, "line-opacity": 0.9, "line-dasharray": [2, 1.4] },
    });

    map.on("click", "kereta-titik", (e) => {
      const f = e.features?.[0];
      if (f && onTrain) onTrain(f.properties);
    });
    map.on("mouseenter", "kereta-titik", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "kereta-titik", () => (map.getCanvas().style.cursor = ""));

    siap = true;
    if (antre.trains) map.getSource("kereta")?.setData(keGeo(antre.trains));
    if (antre.stations) map.getSource("stasiun")?.setData(keStasiun(antre.stations));
    if (antre.jalur) map.getSource("jalur")?.setData(keJalur(antre.jalur));
  });

  if (import.meta.env.DEV) window.__diag = () => {
    const n = (id) => { try { return map.queryRenderedFeatures({ layers: [id] }).length; } catch (e) { return -1; } };
    const q = (id) => { try { return map.querySourceFeatures(id).length; } catch (e) { return -1; } };
    return {
      loaded: map.loaded(), zoom: Number(map.getZoom().toFixed(2)), siap,
      srcKereta: q("kereta"), srcStasiun: q("stasiun"),
      rGedung: n("gedung-3d"), rStasiun: n("stasiun-titik"), rKereta: n("kereta-titik"),
    };
  };

  function keGeo(trains) {
    return {
      type: "FeatureCollection",
      features: trains.map((t) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [t[4], t[3]] },
        properties: { id: t[0], kode: t[1], tipe: t[2], arah: t[5], next: t[6] },
      })),
    };
  }

  function keStasiun(stations) {
    return {
      type: "FeatureCollection",
      features: stations.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s[3], s[2]] },
        properties: { kode: s[0], nama: s[1], free: s[4] },
      })),
    };
  }

  function keJalur(jalur) {
    return {
      type: "FeatureCollection",
      features:
        jalur && jalur.length > 1
          ? [{ type: "Feature", geometry: { type: "LineString", coordinates: jalur.map((p) => [p.lng, p.lat]) }, properties: {} }]
          : [],
    };
  }

  return {
    setTrains(trains) {
      antre.trains = trains;
      if (siap) map.getSource("kereta")?.setData(keGeo(trains));
    },
    setStations(stations) {
      antre.stations = stations;
      if (siap) map.getSource("stasiun")?.setData(keStasiun(stations));
    },
    setJalur(jalur) {
      antre.jalur = jalur;
      if (siap) map.getSource("jalur")?.setData(keJalur(jalur));
    },
    setWarnaGedung(c) {
      warnaGedung = exprWarna(c);
      if (siap && map.getLayer("gedung-3d")) map.setPaintProperty("gedung-3d", "fill-extrusion-color", warnaGedung);
    },
    modeHelikopter(on) {
      map.easeTo({ pitch: on ? 58 : 0, bearing: on ? -17 : 0, duration: 700 });
    },
    flyKe(lng, lat, zoom = 13) {
      map.flyTo({ center: [lng, lat], zoom, pitch: 55, duration: 900 });
    },
    resize() {
      map.resize();
    },
    map,
  };
}
