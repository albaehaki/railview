import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://tiles.openfreemap.org/styles/dark";
const PUSAT = [106.86, -6.22];

export function createMap(el, { onTrain, onBus } = {}) {
  let tj = null;
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
            minzoom: 12.6,
      paint: {
        "fill-extrusion-color": warnaGedung,
        "fill-extrusion-height": ["*", ["coalesce", ["get", "render_height"], ["get", "height"], 10], 1.9],
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 13, 3],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-color": "#9fb3c8",
        "circle-stroke-width": 1.2,
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
        "circle-color": ["match", ["get", "moda"],
          "K", "#58a874", "M", "#e0524a", "L", "#4a86e0", "J", "#d969b0",
          "W", "#9b6bd6", "A", "#e6ece1", "B", "#d9a24b", "#8b978a"],
        "circle-opacity": 0.16,
      },
    });
    map.addLayer({
      id: "kereta-titik",
      type: "circle",
      source: "kereta",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 7],
        "circle-color": ["match", ["get", "moda"],
          "K", "#58a874", "M", "#e0524a", "L", "#4a86e0", "J", "#d969b0",
          "W", "#9b6bd6", "A", "#e6ece1", "B", "#d9a24b", "#8b978a"],
        "circle-stroke-color": "#f2f6ee",
        "circle-stroke-width": 1.1,
      },
    });

    /* bus TransJakarta (langsung dari broker publik TJ) */
    map.addSource("tj", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "tj-titik",
      type: "circle",
      source: "tj",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.6, 14, 5],
        "circle-color": ["match", ["get", "tipe"], "Mikrotrans", "#f2a541", "BRT", "#e8562a", "#e8562a"],
        "circle-opacity": 0.9,
        "circle-stroke-color": "#120a06",
        "circle-stroke-width": 0.7,
      },
    });
    map.on("click", "tj-titik", (e) => {
      const f = e.features?.[0];
      if (f) new maplibregl.Popup({ closeButton: false, offset: 8 })
        .setLngLat(f.geometry.coordinates)
        .setHTML(`<b>${f.properties.rute}</b><br>${f.properties.nama}<br><small>${f.properties.id} · ${f.properties.tipe}</small>`)
        .addTo(map);
    });

    import("./tj.js").then(({ sambungTJ }) => {
      tj = sambungTJ((feats) => {
        map.getSource("tj")?.setData({ type: "FeatureCollection", features: feats });
        onBus?.(feats.length);
      });
    });

    /* jalur kereta terpilih */
    map.addSource("jalur", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "jalur-garis",
      type: "line",
      source: "jalur",
      paint: { "line-color": "#d9a24b", "line-width": 2.4, "line-opacity": 0.9, "line-dasharray": [2, 1.4] },
    });

    /* garis rel asli dari OSM, dimuat setelah peta siap supaya tidak menahan loading */
    const muatRel = async () => {
      if (map.getSource("rel")) return;
      try {
        const g = await fetch("/rel.geojson").then((r) => r.json());
        if (!map.getSource("rel")) {
          map.addSource("rel", { type: "geojson", data: g });
          map.addLayer({
            id: "rel-garis",
            type: "line",
            source: "rel",
            paint: { "line-color": "#7d8b6f", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 2.6], "line-opacity": 0.9 },
          }, "kereta-halo");
        }
      } catch (e) {
        console.warn("rel gagal dimuat", e);
      }
    };
    if (map.getZoom() >= 11) muatRel();
    else map.once("zoomend", () => { if (map.getZoom() >= 11) muatRel(); });

    map.on("click", "kereta-titik", (e) => {
      const f = e.features?.[0];
      if (f && onTrain) onTrain(f.properties);
    });
    map.on("mouseenter", "kereta-titik", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "kereta-titik", () => (map.getCanvas().style.cursor = ""));

    siap = true;
    if (antre.trains) pasang(antre.trains);
    if (antre.stations) map.getSource("stasiun")?.setData(keStasiun(antre.stations));
    if (antre.jalur) map.getSource("jalur")?.setData(keJalur(antre.jalur));
    setInterval(() => { if (siap) gambar(); }, 250);
  });

  if (import.meta.env.DEV) window.__diag = () => {
    const n = (id) => { try { return map.queryRenderedFeatures({ layers: [id] }).length; } catch (e) { return -1; } };
    const q = (id) => { try { return map.querySourceFeatures(id).length; } catch (e) { return -1; } };
    return {
      loaded: map.loaded(), zoom: Number(map.getZoom().toFixed(2)), siap,
      srcKereta: q("kereta"), srcStasiun: q("stasiun"),
      rGedung: n("gedung-3d"), rStasiun: n("stasiun-titik"), rKereta: n("kereta-titik"), rel: !!map.getLayer("rel-garis"),
      contoh: (() => { const f = map.querySourceFeatures("kereta")[0]; return f ? f.geometry.coordinates.map((v) => +v.toFixed(6)) : null; })(),
      gerak: gerak.size, f: +fKini().toFixed(3),
      satu: (() => { const e = gerak.values().next().value; return e ? [e.fx, e.fy, e.tx, e.ty] : null; })(),
    };
  };

  /* posisi bergerak halus: interpolasi dari posisi lama ke posisi baru tiap 20 dtk */
  const gerak = new Map();
  let DUR = 10000;
  let t0 = performance.now();
  let terakhir = 0;

  const fKini = () => Math.min(1, (performance.now() - t0) / DUR);

  function gambar() {
    const f = fKini();
    const feats = [];
    for (const [, g] of gerak) {
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [g.fx + (g.tx - g.fx) * f, g.fy + (g.ty - g.fy) * f] },
        properties: g.p,
      });
    }
    map.getSource("kereta")?.setData({ type: "FeatureCollection", features: feats });
  }

  function pasang(trains) {
    const f = fKini();
    const kini = performance.now();
    /* durasi interpolasi mengikuti jarak antar-permintaan yang sebenarnya,
       supaya tidak berhenti lalu melompat saat jaringan lambat */
    if (terakhir) DUR = Math.min(15000, Math.max(4000, (kini - terakhir) * 1.06));
    terakhir = kini;
    const baru = new Map();
    for (const t of trains) {
      const lama = gerak.get(t[0]);
      baru.set(t[0], {
        fx: lama ? lama.fx + (lama.tx - lama.fx) * f : t[4],
        fy: lama ? lama.fy + (lama.ty - lama.fy) * f : t[3],
        tx: t[4],
        ty: t[3],
        p: { id: t[0], kode: t[1], moda: t[2], arah: t[5], next: t[6] },
      });
    }
    /* kereta yang hilang sesaat tetap ditahan satu putaran agar tidak berkedip */
    for (const [k, g] of gerak) {
      if (!baru.has(k) && !g.miss) baru.set(k, { fx: g.tx, fy: g.ty, tx: g.tx, ty: g.ty, p: g.p, miss: 1 });
    }
    gerak.clear();
    for (const [k, v] of baru) gerak.set(k, v);
    t0 = performance.now();
    gambar();
  }

  /* pemantau gerak (dipakai untuk uji kelancaran) */
  window.__rv = () => [...gerak.values()].map((g) => {
    const f = fKini();
    return [g.fx + (g.tx - g.fx) * f, g.fy + (g.ty - g.fy) * f];
  });

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
      if (siap) pasang(trains);
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
    hentikan() {
      tj?.berhenti();
    },
    map,
  };
}
