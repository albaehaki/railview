import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://tiles.openfreemap.org/styles/dark";
const PUSAT = [106.86, -6.22];

/* Bandara yang punya geometri apron/gate/stand (OpenStreetMap) */
const BANDARA = {
  CGK: {
    kode: "CGK", icao: "WIII", nama: "Soekarno–Hatta", kota: "Tangerang",
    lng: 106.6572, lat: -6.1190, zoom: 16.4, geo: "/bandara-cgk.geojson",
  },
  HLP: {
    kode: "HLP", icao: "WIHH", nama: "Halim Perdanakusuma", kota: "Jakarta Timur",
    lng: 106.8906, lat: -6.2666, zoom: 15.9, geo: "/bandara-hlp.geojson",
  },
};

const SATELIT_TILE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const KACA_H = 0.0008; // ±89 m — batas aman export Esri (512 px)

export function createMap(el, { onTrain, onKamera, onBus, onStasiun, onBandara, onKaca } = {}) {
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

  /* ── mode bandara ── */
  let bandaraKode = null;
  let bandaraAktif = false;
  const bandaraCache = {}; // kode → FeatureCollection

/* ── penempel posisi ke rel (biar kereta tidak keluar jalur) ── */
const relSeg = new Map();
const SEL = 0.005; // ±550 m per sel
let relSiap = false;

function indeksRel(g) {
  for (const f of g.features || []) {
    const gm = f.geometry;
    if (!gm || (gm.type !== "LineString" && gm.type !== "MultiLineString")) continue;
    const garis = gm.type === "MultiLineString" ? gm.coordinates : [gm.coordinates];
    for (const ln of garis) {
      for (let i = 0; i < ln.length - 1; i++) {
        const [x1, y1] = ln[i];
        const [x2, y2] = ln[i + 1];
        if (!Number.isFinite(x1) || !Number.isFinite(y1)) continue;
        const a1 = Math.floor(x1 / SEL), a2 = Math.floor(x2 / SEL);
        const b1 = Math.floor(y1 / SEL), b2 = Math.floor(y2 / SEL);
        const s = [x1, y1, x2, y2, f.properties?.j || "rail"];
        for (let a = Math.min(a1, a2); a <= Math.max(a1, a2); a++) {
          for (let b = Math.min(b1, b2); b <= Math.max(b1, b2); b++) {
            const k = a + "," + b;
            let arr = relSeg.get(k);
            if (!arr) relSeg.set(k, (arr = []));
            arr.push(s);
          }
        }
      }
    }
  }
  relSiap = relSeg.size > 0;
}

const JENIS_MODA = { K: "rail", M: "subway", L: "light_rail", W: "rail", A: "rail", B: "rail" };

function tempelRel(lng, lat, jenis) {
  if (!relSiap) return null;
  const cx = Math.floor(lng / SEL), cy = Math.floor(lat / SEL);
  let px = null, py = null, bd = Infinity;
  let qx2 = null, qy2 = null, bd2 = Infinity;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const arr = relSeg.get(cx + i + "," + (cy + j));
      if (!arr) continue;
      for (const s of arr) {
        const dx = s[2] - s[0], dy = s[3] - s[1];
        const l2 = dx * dx + dy * dy || 1e-12;
        let t = ((lng - s[0]) * dx + (lat - s[1]) * dy) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = s[0] + dx * t, qy = s[1] + dy * t;
        const d = (qx - lng) ** 2 + (qy - lat) ** 2;
        if (d < bd) { bd = d; px = qx; py = qy; }
        if (!jenis || s[4] === jenis) { if (d < bd2) { bd2 = d; qx2 = qx; qy2 = qy; } }
      }
    }
  }
  if (jenis && bd2 < 1.6e-6) return [qx2, qy2];       // jenis yang cocok (KRL/LRT/MRT)
  return bd < 1.6e-6 ? [px, py] : null;               // cadangan: rel terdekat apa pun
}

  map.on("load", () => {
    /* satelit bandara — paling bawah, hanya muncul di mode bandara */
    map.addSource("satelit", {
      type: "raster",
      tiles: [SATELIT_TILE],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Citra: Esri, Maxar, Earthstar Geographics",
    });
    map.addLayer({
      id: "satelit",
      type: "raster",
      source: "satelit",
      layout: { visibility: "none" },
      paint: {
        "raster-opacity": 1,
        "raster-brightness-max": 0.9,
        "raster-contrast": 0.06,
        "raster-saturation": -0.12,
      },
    });

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

    /* ikon stasiun (kotak kecil bergaya papan nama) */
    if (!map.hasImage("stasiun-ikon")) {
      const s = 28;
      const c = document.createElement("canvas");
      c.width = c.height = s;
      const x = c.getContext("2d");
      x.fillStyle = "#0a0f0a";
      x.strokeStyle = "#cfd8cb";
      x.lineWidth = 2;
      x.beginPath();
      x.roundRect(4, 4, 20, 20, 3);
      x.fill();
      x.stroke();
      x.fillStyle = "#cfd8cb";
      x.fillRect(8, 9, 12, 2.2);
      x.fillRect(9, 13, 10, 1.6);
      x.beginPath();
      x.arc(11, 18, 1.7, 0, Math.PI * 2);
      x.arc(17, 18, 1.7, 0, Math.PI * 2);
      x.fill();
      map.addImage("stasiun-ikon", x.getImageData(0, 0, s, s), { pixelRatio: 2 });
    }
    map.addLayer({
      id: "stasiun-ikon",
      type: "symbol",
      source: "stasiun",
      layout: {
        "icon-image": "stasiun-ikon",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.34, 13, 0.66],
        "icon-allow-overlap": true,
      },
    });

    /* jalur rencana & konstruksi (OSM) — garis putus-putus, bisa dimatikan */
    const WARNA_RENCANA = {
      "MRT Utara–Selatan": "#4f9cf0", "MRT Timur–Barat": "#c07be0",
      "Manggarai–Jatinegara": "#e0b04f", "Dwiganda Bekasi–Cikarang": "#5fc7b0",
      "Terusan Tangerang": "#e07f9c", "LRT Jabodebek": "#8fb85f",
      "LRT Jakarta 1B": "#d4568f", "Tanjung Priok–Cikarang": "#b9a888",
      "Cipatat–Sasaksaat": "#9aa0a6", "Rencana lain": "#8c9a84",
    };
    const susunRencana = (g) => ["match", ["get", "proyek"], ...Object.entries(WARNA_RENCANA).flat(), "#8c9a84"];
    fetch("/rencana.geojson?v=2")
      .then((r) => r.json())
      .then((g) => {
        if (map.getSource("rencana")) return;
        map.addSource("rencana", { type: "geojson", data: g });
        map.addLayer({
          id: "rencana-garis",
          type: "line",
          source: "rencana",
          filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "perkiraan"], true]],
          minzoom: 9.5,
          layout: { "line-cap": "butt", "line-join": "round" },
          paint: {
            "line-color": susunRencana(),
            "line-width": ["interpolate", ["linear"], ["zoom"], 9.5, 1.2, 13, 2.2, 16, 3],
            "line-dasharray": [2, 2],
            "line-opacity": 0.85,
          },
        });
        /* kelanjutan tahap 2: perkiraan, lebih pudar */
        map.addLayer({
          id: "rencana-perkiraan",
          type: "line",
          source: "rencana",
          filter: ["==", ["get", "perkiraan"], true],
          minzoom: 9.5,
          layout: { "line-cap": "butt", "line-join": "round" },
          paint: {
            "line-color": "#a98be0",
            "line-width": ["interpolate", ["linear"], ["zoom"], 9.5, 1, 14, 1.8],
            "line-dasharray": [1.2, 2],
            "line-opacity": 0.45,
          },
        });

        map.addLayer({
          id: "rencana-stasiun",
          type: "circle",
          source: "rencana",
          filter: ["all", ["==", ["geometry-type"], "Point"], ["!", ["has", "catatan"]], ["!=", ["get", "perkiraan"], true]],
          minzoom: 10.5,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 2.6, 14, 4.4],
            "circle-color": "#050705",
            "circle-stroke-color": susunRencana(),
            "circle-stroke-width": 1.6,
          },
        });
        map.addLayer({
          id: "rencana-nama",
          type: "symbol",
          source: "rencana",
          filter: ["all", ["==", ["geometry-type"], "Point"], ["!", ["has", "catatan"]]],
          minzoom: 12.5,
          layout: {
            "text-field": ["get", "nama"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 9.5,
            "text-offset": [0, 1.15],
            "text-anchor": "top",
            "text-padding": 3,
          },
          paint: { "text-color": "#9fb094", "text-halo-color": "#050705", "text-halo-width": 1.2 },
        });
      /* catatan di peta (ikut sumber rencana) */
      map.addLayer({
        id: "rencana-catatan",
        type: "symbol",
        source: "rencana",
        filter: ["has", "catatan"],
        minzoom: 10,
        layout: {
          "text-field": ["get", "catatan"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10.5,
          "text-anchor": "left",
          "text-offset": [0.7, 0],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#e2c6ff", "text-halo-color": "#050705", "text-halo-width": 1.8 },
      });
      })
      .catch(() => {});

    /* ── pesawat langsung (OpenSky lewat proxy) ── */
    if (!map.hasImage("pesawat-ikon")) {
      const c = document.createElement("canvas");
      c.width = c.height = 40;
      const x = c.getContext("2d");
      x.translate(20, 20);
      x.fillStyle = "#d3e5f7";
      x.beginPath();
      x.moveTo(0, -14); x.lineTo(3.2, -3); x.lineTo(15, 3); x.lineTo(15, 6);
      x.lineTo(3.2, 3.4); x.lineTo(2.4, 11); x.lineTo(7, 14); x.lineTo(7, 16);
      x.lineTo(0, 14.4); x.lineTo(-7, 16); x.lineTo(-7, 14); x.lineTo(-2.4, 11);
      x.lineTo(-3.2, 3.4); x.lineTo(-15, 6); x.lineTo(-15, 3); x.lineTo(-3.2, -3);
      x.closePath(); x.fill();
      map.addImage("pesawat-ikon", x.getImageData(0, 0, 40, 40), { pixelRatio: 2 });
    }
    map.addSource("pesawat", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "pesawat-ikon",
      type: "symbol",
      source: "pesawat",
      filter: ["!=", ["get", "darat"], true],
      layout: {
        "icon-image": "pesawat-ikon",
        "icon-rotate": ["get", "arah"],
        "icon-rotation-alignment": "map",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 7, 0.42, 13, 0.8],
        "icon-allow-overlap": true,
      },
      paint: { "icon-opacity": 0.92 },
    });
    map.addLayer({
      id: "pesawat-nama",
      type: "symbol",
      source: "pesawat",
      minzoom: 10,
      layout: {
        "text-field": ["get", "callsign"], "text-font": ["Noto Sans Regular"],
        "text-size": 10, "text-offset": [0, 1.05], "text-anchor": "top", "text-padding": 2,
      },
      paint: { "text-color": "#d6e7f8", "text-halo-color": "#050705", "text-halo-width": 1.4 },
    });
    map.addLayer({
      id: "pesawat-darat",
      type: "symbol",
      source: "pesawat",
      filter: ["==", ["get", "darat"], true],
      minzoom: 9.5,
      layout: {
        "icon-image": "pesawat-ikon",
        "icon-rotate": ["get", "arah"],
        "icon-rotation-alignment": "map",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9.5, 0.26, 14, 0.55],
        "icon-allow-overlap": true,
      },
      paint: { "icon-opacity": 0.75 },
    });
    map.addLayer({
      id: "pesawat-darat-nama",
      type: "symbol",
      source: "pesawat",
      filter: ["==", ["get", "darat"], true],
      minzoom: 12,
      layout: {
        "text-field": ["get", "callsign"], "text-font": ["Noto Sans Regular"],
        "text-size": 8.5, "text-offset": [0, 0.9], "text-anchor": "top",
      },
      paint: { "text-color": "#9fb6cc", "text-halo-color": "#050705", "text-halo-width": 1.1 },
    });

    map.on("click", "pesawat-ikon", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties;
      new maplibregl.Popup({ closeButton: false, offset: 14, className: "pop-psw", maxWidth: "240px" })
        .setLngLat(f.geometry.coordinates)
        .setHTML(`<div class="pps"><div class="pps-kode">${p.callsign}</div>
          <div class="pps-negara">${p.negara || "—"}</div>
          <div class="pps-angka">${p.alt ? (p.alt + " m") : "—"} · ${p.cepat ? (p.cepat + " km/j") : "—"} · ${p.arah}°</div></div>`)
        .addTo(map);
    });

    let pesawatHidup = true;
    async function muatPesawat() {
      if (!pesawatHidup) return;
      try {
        const d = await (await fetch(`/api/pesawat?t=${Date.now()}`)).json();
        const feats = (d.pesawat || []).map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: p,
        }));
        map.getSource("pesawat")?.setData({ type: "FeatureCollection", features: feats });
      } catch {}
    }
    muatPesawat();
    setInterval(muatPesawat, 30000);
    window.__setPesawat = (v) => {
      pesawatHidup = v;
      for (const id of ["pesawat-ikon", "pesawat-nama", "pesawat-darat", "pesawat-darat-nama"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
      }
      if (v) muatPesawat();
    };

    window.__setRencana = (v) => {
      for (const id of ["rencana-garis", "rencana-perkiraan", "rencana-stasiun", "rencana-nama", "rencana-catatan"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v ? "visible" : "none");
      }
    };

    /* stasiun lengkap dari OSM (158 titik) — data 168railway cuma 85 dan banyak di luar Jabodetabek */
    for (const id of ["stasiun-titik", "stasiun-ikon", "stasiun-nama"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    }
    fetch("/stasiun-osm.geojson?v=1")
      .then((r) => r.json())
      .then((g) => {
        if (map.getSource("stasiunOsm")) return;
        onStasiun?.(g.features.length);
        map.addSource("stasiunOsm", { type: "geojson", data: g });
        map.addLayer({
          id: "stasiun-osm-ikon",
          type: "symbol",
          source: "stasiunOsm",
          layout: {
            "icon-image": "stasiun-ikon",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.34, 13, 0.62],
            "icon-allow-overlap": true,
          },
        });
        map.addLayer({
          id: "stasiun-osm-nama",
          type: "symbol",
          source: "stasiunOsm",
          minzoom: 11.5,
          layout: {
            "text-field": ["get", "nama"],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 11.5, 9, 15, 11.5],
            "text-offset": [0, 1.1],
            "text-anchor": "top",
            "text-allow-overlap": false,
            "text-padding": 3,
          },
          paint: { "text-color": "#cdd6c6", "text-halo-color": "#050705", "text-halo-width": 1.3 },
        });
      })
      .catch(() => {});

    /* kereta */
    /* ── ikon kendaraan (kereta / bus / mobil) ── */
    const WARNA_MODA = { K: "#58a874", M: "#e0524a", L: "#4a86e0", J: "#d969b0", W: "#9b6bd6", A: "#e6ece1", B: "#d9a24b" };
    const ikonKendaraan = (nama, warna, jenis) => {
      if (map.hasImage(nama)) return;
      const S = 48;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const x = c.getContext("2d");
      x.lineJoin = "round"; x.lineWidth = 2.6; x.strokeStyle = "#040604";
      x.fillStyle = warna;
      const terang = "#f2f7ee";
      if (jenis === "kereta") {
        x.fillStyle = terang;
        x.beginPath(); x.roundRect(17, 4, 14, 40, 6); x.fill(); x.stroke();
        x.fillStyle = warna;
        x.beginPath(); x.roundRect(20, 9, 8, 30, 3); x.fill();
        x.fillStyle = "#0d160f";
        x.beginPath(); x.roundRect(20, 12, 8, 5, 2); x.fill();
        x.beginPath(); x.roundRect(20, 33, 8, 5, 2); x.fill();
      } else if (jenis === "bus") {
        x.fillStyle = terang;
        x.beginPath(); x.roundRect(15, 7, 18, 34, 5); x.fill(); x.stroke();
        x.fillStyle = warna;
        x.beginPath(); x.roundRect(18, 11, 12, 26, 3); x.fill();
        x.fillStyle = "#0d160f";
        x.beginPath(); x.roundRect(19, 13, 10, 5, 2); x.fill();
        x.beginPath(); x.roundRect(19, 31, 10, 5, 2); x.fill();
      } else {
        x.fillStyle = terang;
        x.beginPath(); x.roundRect(17, 12, 14, 26, 5); x.fill(); x.stroke();
        x.fillStyle = warna;
        x.beginPath(); x.roundRect(19.5, 16, 9, 16, 3); x.fill();
        x.fillStyle = "#0d160f";
        x.beginPath(); x.roundRect(20.5, 18, 7, 4, 1.5); x.fill();
        x.beginPath(); x.roundRect(20.5, 27, 7, 4, 1.5); x.fill();
      }
      map.addImage(nama, x.getImageData(0, 0, S, S), { pixelRatio: 2 });
    };
    for (const [m, c] of Object.entries(WARNA_MODA)) ikonKendaraan("kereta-" + m, c, "kereta");
    ikonKendaraan("bus-brt", "#f08a2c", "bus");
    ikonKendaraan("mobil-mikro", "#4fd1b5", "mobil");
    ikonKendaraan("mobil-angkot", "#a98be0", "mobil");
    ikonKendaraan("mobil-rusun", "#e07fb8", "mobil");

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

    /* kamera CCTV publik di peta */
    if (!map.hasImage("kamera-ikon")) {
      const s = 26;
      const c = document.createElement("canvas");
      c.width = c.height = s;
      const x = c.getContext("2d");
      x.fillStyle = "#20180a";
      x.strokeStyle = "#d9a24b";
      x.lineWidth = 2;
      x.beginPath();
      x.roundRect(3, 6, 20, 14, 3);
      x.fill();
      x.stroke();
      x.fillStyle = "#d9a24b";
      x.beginPath();
      x.arc(9, 13, 3.4, 0, Math.PI * 2);
      x.fill();
      x.fillRect(14, 11, 6, 4);
      map.addImage("kamera-ikon", x.getImageData(0, 0, s, s), { pixelRatio: 2 });
    }
    map.addSource("kamera", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "kamera-halo",
      type: "circle",
      source: "kamera",
      minzoom: 9.5,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9.5, 6, 14, 10],
        "circle-color": "#d9a24b",
        "circle-opacity": 0.22,
        "circle-stroke-color": "#d9a24b",
        "circle-stroke-width": 1,
        "circle-stroke-opacity": 0.55,
      },
    });
    map.addLayer({
      id: "kamera-ikon",
      type: "symbol",
      source: "kamera",
      minzoom: 9.5,
      layout: {
        "icon-image": "kamera-ikon",
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9.5, 0.5, 14, 0.95],
        "icon-allow-overlap": true,
      },
    });
    map.on("click", "kamera-ikon", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties;
      const isi = p.embed
        ? `<iframe class="cam-pop" src="${p.embed}" allow="autoplay; fullscreen" loading="lazy" referrerpolicy="no-referrer"></iframe>`
        : p.foto
        ? `<img class="cam-pop" src="${p.foto}?t=${Date.now()}" alt="${p.judul}" />`
        : `<div class="cam-kosong">tidak ada tayangan</div>`;
      new maplibregl.Popup({ closeButton: true, offset: 14, className: "pop-cam", maxWidth: "320px" })
        .setLngLat(f.geometry.coordinates)
        .setHTML(`<div class="pcam">
            <div class="pcam-t">${p.judul || "kamera"}</div>
            <div class="pcam-kota">${p.kota || ""}${p.perkiraan ? " · titik perkiraan" : ""}</div>
            <div class="pcam-tayang">${isi}</div>
            <div class="pcam-s">siaran publik · klik kamera lain untuk ganti</div>
          </div>`)
        .addTo(map);
    });
    map.on("mouseenter", "kamera-ikon", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "kamera-ikon", () => (map.getCanvas().style.cursor = ""));

    fetch(`/api/cctv?what=peta&t=${Date.now()}`)
      .then((r) => r.json())
      .then((d) => {
        const feats = (d.kamera || [])
          .filter((k) => k.lat && k.lng)
          .map((k) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [k.lng, k.lat] },
            properties: { nama: k.nama, judul: k.judul, kota: k.kota, jenis: k.jenis,
              embed: k.embed || "", foto: k.foto || "", perkiraan: !!k.perkiraan },
          }));
        map.getSource("kamera")?.setData({ type: "FeatureCollection", features: feats });
      })
      .catch(() => {});

    /* bus TransJakarta (langsung dari broker publik TJ) */
    map.addSource("tj", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "tj-titik",
      type: "circle",
      source: "tj",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.6, 14, 5],
        "circle-color": ["match", ["get", "tipe"],
          "Mikrotrans", "#4fd1b5",
          "BRT", "#f08a2c",
          "Angkutan Umum Integrasi", "#a98be0",
          "Rusun", "#e07fb8",
          "#f08a2c"],
        "circle-opacity": 0.95,
        "circle-stroke-color": ["match", ["get", "tipe"], "Mikrotrans", "#06322b", "#1a0d04"],
        "circle-stroke-width": ["match", ["get", "tipe"], "Mikrotrans", 0.9, 0.8],
      },
    });
    /* jalur rute TJ dari OSM: koridor BRT selalu tampil, rute lain saat bus diklik */
    let ruteSiap = false;
    fetch("/tj-rute.geojson?v=1")
      .then((r) => r.json())
      .then((g) => {
        if (map.getSource("tjRute")) return;
        map.addSource("tjRute", { type: "geojson", data: g });
        map.addLayer({
          id: "tj-rute-brt",
          type: "line",
          source: "tjRute",
          filter: ["all", ["==", ["get", "tipe"], "brt"], ["in", ["get", "ref"], ["literal", ["1","2","3","4","5","6","7","8","9","10","11","12","13","14"]]]],
          minzoom: 10.5,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#f08a2c", "line-width": ["interpolate", ["linear"], ["zoom"], 10.5, 1, 14, 2.4], "line-opacity": 0.28 },
        });
        map.addLayer({
          id: "tj-rute-pilih",
          type: "line",
          source: "tjRute",
          filter: ["==", ["get", "ref"], "—"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["match", ["get", "tipe"], "mikrotrans", "#4fd1b5", "#f2a541"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 4],
            "line-opacity": 0.9,
          },
        });
        ruteSiap = true;
      })
      .catch(() => {});

    const tampilJalurTJ = (ref) => {
      if (!ruteSiap || !map.getLayer("tj-rute-pilih")) return;
      map.setFilter("tj-rute-pilih", ["==", ["get", "ref"], ref || "—"]);
    };
    window.__tjJalur = tampilJalurTJ;

    map.on("click", "tj-titik", (e) => {
      const f = e.features?.[0];
      if (f) {
        const p = f.properties;
        new maplibregl.Popup({ closeButton: false, offset: 14, className: "pop-tj", maxWidth: "280px" })
          .setLngLat(f.geometry.coordinates)
          .setHTML(`<div class="ptj">
            <div class="ptj-utama"><span class="ptj-kode">${p.rute || "TJ"}</span><span class="ptj-tipe">${p.tipe || "BRT"}</span></div>
            <div class="ptj-nama">${p.nama || "TransJakarta"}</div>
            <div class="ptj-id">${p.id}</div>
          </div>`)
          .addTo(map);
        tampilJalurTJ(p.rute);
      }
    });
    map.on("click", (e) => {
      if (!map.queryRenderedFeatures(e.point, { layers: ["tj-titik"] }).length) tampilJalurTJ(null);
    });

    /* TransJakarta: posisi masuk tiap 1,5 dtk, tapi digambar dengan interpolasi 250 ms
       supaya bus bergerak mulus, tidak melompat */
    const tjGerak = new Map();
    const tjPosisi = (g, kini) => {
      const f = Math.min(1, (kini - g.t0) / g.dur);
      return [g.fx + (g.tx - g.fx) * f, g.fy + (g.ty - g.fy) * f];
    };
    const gambarTJ = () => {
      const kini = performance.now();
      const feats = [];
      for (const [id, g] of tjGerak) {
        const [lng, lat] = tjPosisi(g, kini);
        feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { ...g.p, id } });
      }
      map.getSource("tj")?.setData({ type: "FeatureCollection", features: feats });
    };

    import("./tj.js").then(({ sambungTJ }) => {
      tj = sambungTJ((feats) => {
        const kini = performance.now();
        const hidup = new Set();
        for (const f of feats) {
          const id = f.properties.id;
          hidup.add(id);
          const [lng, lat] = f.geometry.coordinates;
          const lama = tjGerak.get(id);
          if (!lama) {
            tjGerak.set(id, { fx: lng, fy: lat, tx: lng, ty: lat, t0: kini, dur: 1000, p: f.properties });
          } else {
            const [cx, cy] = tjPosisi(lama, kini);
            const jeda = kini - (lama.tBaru || lama.t0);
            const jauh = Math.hypot((lng - cx) * 111320 * Math.cos(cy * Math.PI / 180), (lat - cy) * 110540);
            /* lompatan > 500 m bukan pergerakan wajar: langsung pindah, jangan meluncur */
            if (jauh > 500) {
              tjGerak.set(id, { fx: lng, fy: lat, tx: lng, ty: lat, t0: kini, tBaru: kini, dur: 1, p: f.properties });
            } else {
              tjGerak.set(id, {
                fx: cx, fy: cy, tx: lng, ty: lat, t0: kini, tBaru: kini,
                dur: Math.min(8000, Math.max(1500, jeda * 1.1)),
                p: f.properties,
              });
            }
          }
        }
        for (const id of [...tjGerak.keys()]) if (!hidup.has(id)) tjGerak.delete(id);
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
        const g = await fetch("/rel.geojson?v=5").then((r) => r.json());
        if (!map.getSource("rel")) {
          map.addSource("rel", { type: "geojson", data: g });
          map.addLayer({
            id: "rel-garis",
            type: "line",
            source: "rel",
            paint: { "line-color": "#7d8b6f", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 14, 2.6], "line-opacity": 0.9 },
          }, "kereta-halo");
          indeksRel(g);
        }
        /* LRT Jakarta (Velodrome–Manggarai) — jalurnya belum ada di rel.geojson */
        const l = await fetch("/lrt-jakarta.geojson?v=1").then((r) => r.json()).catch(() => null);
        if (l && !map.getSource("rel-lrtj")) {
          map.addSource("rel-lrtj", { type: "geojson", data: l });
          map.addLayer({
            id: "rel-lrtj-garis",
            type: "line",
            source: "rel-lrtj",
            paint: { "line-color": "#d4568f", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 15, 2.8], "line-opacity": 0.95 },
          }, "kereta-halo");
          indeksRel(l);
        }
      } catch (e) {
        console.warn("rel gagal dimuat", e);
      }
    };
    setTimeout(muatRel, 1200);
    map.once("zoomend", () => { if (map.getZoom() >= 11) muatRel(); });

    map.on("click", "kereta-titik", async (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties;
      const MODA = { K: "KRL", M: "MRT", L: "LRT Jabodebek", J: "LRT Jakarta", W: "Whoosh", A: "Antarkota", B: "Barang" };
      const jam = (ms) => {
        if (!ms) return "—";
        const d = new Date(Number(ms));
        return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      };
      const pop = new maplibregl.Popup({ closeButton: true, offset: 12, className: "pop-kereta", maxWidth: "300px" })
        .setLngLat(f.geometry.coordinates)
        .setHTML(`<div class="pkr">
            <div class="pkr-atas"><span class="pkr-kode">${p.kode || p.id}</span><span class="pkr-moda">${MODA[p.moda] || p.moda}</span></div>
            <div class="pkr-muat">memuat rincian perjalanan…</div>
          </div>`)
        .addTo(map);

      if (onTrain) onTrain({ ...p, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });

      try {
        const j = await fetch(`/api/rail?what=jalur&id=${encodeURIComponent(p.id)}`).then((r) => r.json());
        if (!j || !j.jalur) {
          pop.setHTML(`<div class="pkr">
              <div class="pkr-atas"><span class="pkr-kode">${p.kode || p.id}</span><span class="pkr-moda">${MODA[p.moda] || p.moda}</span></div>
              <div class="pkr-sub">kereta ini tidak membawa data jalur (kirim rangkaian / di luar layanan)</div>
              <div class="pkr-kaki">sumber: 168railway</div>
            </div>`);
          return;
        }
        const jalur = j.jalur;
        const iNext = Math.max(0, jalur.findIndex((s) => s.st === p.next));
        const lewat = jalur.slice(iNext, iNext + 4);
        const baris = lewat.map((s, i) => {
          const now = i === 0;
          return `<div class="pkr-baris${now ? " now" : ""}">
              <span class="pkr-jam">${jam(i === 0 ? s.arr : s.arr)}</span>
              <span class="pkr-st">${s.nama || s.st}${now ? " · berikutnya" : ""}</span>
            </div>`;
        }).join("");
        pop.setHTML(`<div class="pkr">
            <div class="pkr-atas"><span class="pkr-kode">${p.kode || p.id}</span><span class="pkr-moda">${MODA[p.moda] || p.moda}</span></div>
            <div class="pkr-relasi">${j.relasi || "—"}</div>
            <div class="pkr-sub">${jalur.length} stasiun · ${j.tipe || ""}</div>
            <div class="pkr-jadwal">${baris}</div>
            <div class="pkr-kaki">posisi dari jadwal GAPEKA, bukan GPS</div>
          </div>`);
      } catch (err) {
        pop.setHTML(`<div class="pkr"><div class="pkr-atas"><span class="pkr-kode">${p.kode || p.id}</span><span class="pkr-moda">${MODA[p.moda] || p.moda}</span></div>
          <div class="pkr-muat">rincian gagal dimuat (${String(err && err.message || err).slice(0, 40)})</div></div>`);
      }
    });
    map.on("mouseenter", "kereta-titik", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "kereta-titik", () => (map.getCanvas().style.cursor = ""));

    /* ── lapisan bandara: apron, gate, marka stand ── */
    map.addSource("bandara", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const aba = (k) => ["==", ["get", "aeroway"], k];
    const sembunyi = { visibility: "none" };

    map.addLayer({
      id: "bd-landasan", type: "line", source: "bandara", filter: aba("runway"), layout: sembunyi,
      paint: { "line-color": "#f2f5ee", "line-opacity": 0.5,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 18, 19, 40] },
    });
    map.addLayer({
      id: "bd-taksi", type: "line", source: "bandara", filter: aba("taxiway"), layout: sembunyi,
      paint: { "line-color": "#ffd894", "line-opacity": 0.45,
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 16, 5, 19, 14] },
    });
    map.addLayer({
      id: "bd-apron", type: "line", source: "bandara", filter: aba("apron"), layout: sembunyi,
      paint: { "line-color": "#ffffff", "line-opacity": 0.28, "line-width": 1, "line-dasharray": [3, 2] },
    });
    map.addLayer({
      id: "bd-terminal", type: "fill", source: "bandara", filter: aba("terminal"), layout: sembunyi,
      paint: { "fill-color": "#d9a24b", "fill-opacity": 0.12 },
    });
    map.addLayer({
      id: "bd-terminal-garis", type: "line", source: "bandara", filter: aba("terminal"), layout: sembunyi,
      paint: { "line-color": "#e0ad5c", "line-opacity": 0.9, "line-width": 1.5 },
    });
    map.addLayer({
      id: "bd-stand", type: "line", source: "bandara", filter: aba("parking_position"), layout: sembunyi,
      paint: { "line-color": "#ffcf7a", "line-opacity": 0.5,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.7, 17, 1.7, 19, 2.6] },
    });
    map.addLayer({
      id: "bd-gate", type: "circle", source: "bandara", filter: aba("gate"), layout: sembunyi,
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2.6, 18, 5.5],
        "circle-color": "#ffcf7a", "circle-stroke-color": "#050705", "circle-stroke-width": 1.4 },
    });
    map.addLayer({
      id: "bd-gate-nama", type: "symbol", source: "bandara", filter: aba("gate"), minzoom: 15,
      layout: { ...sembunyi, "text-field": ["get", "ref"], "text-font": ["Noto Sans Regular"],
        "text-size": 10.5, "text-offset": [0, 1.15], "text-anchor": "top", "text-padding": 3 },
      paint: { "text-color": "#ffe7bd", "text-halo-color": "#050705", "text-halo-width": 1.8 },
    });

    map.addSource("kaca", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "kaca-isi", type: "fill", source: "kaca", layout: sembunyi,
      paint: { "fill-color": "#ffcf7a", "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: "kaca-garis", type: "line", source: "kaca", layout: sembunyi,
      paint: { "line-color": "#ffcf7a", "line-opacity": 0.95, "line-width": 1.4 },
    });

    map.on("click", (e) => {
      if (!bandaraAktif) return;
      const kena = map.queryRenderedFeatures(e.point, { layers: ["kereta-titik", "pesawat-ikon"] });
      if (kena.length) return;
      kacaKe(e.lngLat.lat, e.lngLat.lng, "Area apron");
    });

    /* mode bandara sudah diminta sebelum gaya selesai dimuat → terapkan sekarang */
    if (bandaraAktif && bandaraKode && bandaraCache[bandaraKode]) {
      map.getSource("bandara")?.setData(bandaraCache[bandaraKode]);
      atur("satelit", true);
      atur("gedung-3d", false);
      LAPIS_BANDARA.forEach((id) => atur(id, true));
    }

    siap = true;
    if (antre.trains) pasang(antre.trains);
    if (antre.stations) map.getSource("stasiun")?.setData(keStasiun(antre.stations));
    if (antre.jalur) map.getSource("jalur")?.setData(keJalur(antre.jalur));
    /* kereta: gambar tiap frame (±30 fps) supaya gerak tidak patah-patah */
    let laluGambar = 0;
    const putarLingkar = (ts) => {
      if (siap && !document.hidden && ts - laluGambar > 32) {
        laluGambar = ts;
        gambar();
      }
      requestAnimationFrame(putarLingkar);
    };
    requestAnimationFrame(putarLingkar);
    /* bus TJ: 1.400+ titik, cukup 2,5× per detik */
    setInterval(() => { if (siap && !document.hidden) gambarTJ(); }, 400);
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

  function bangunPita(g) {
    const N = 5, titik = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x0 = g.fx + (g.tx - g.fx) * t;
      const y0 = g.fy + (g.ty - g.fy) * t;
      const s = tempelRel(x0, y0, JENIS_MODA[g.p?.moda]);
      titik.push(s || [x0, y0]);
    }
    const panjang = [];
    let total = 0;
    for (let i = 1; i < titik.length; i++) {
      const d = Math.hypot(titik[i][0] - titik[i - 1][0], titik[i][1] - titik[i - 1][1]);
      panjang.push(d); total += d;
    }
    g.pita = { titik, panjang, total: total || 1e-9 };
  }

  function titikPita(g, f) {
    const { titik, panjang, total } = g.pita;
    let sisa = Math.min(1, Math.max(0, f)) * total;
    for (let i = 0; i < panjang.length; i++) {
      if (sisa <= panjang[i] || i === panjang.length - 1) {
        const k = panjang[i] ? Math.min(1, sisa / panjang[i]) : 0;
        return [titik[i][0] + (titik[i + 1][0] - titik[i][0]) * k, titik[i][1] + (titik[i + 1][1] - titik[i][1]) * k];
      }
      sisa -= panjang[i];
    }
    return titik[titik.length - 1];
  }

  function gambar() {
    const f = fKini();
    const feats = [];
    for (const [, g] of gerak) {
      /* tempel ke rel sekali per data baru: 5 titik sampel, lalu gerak mengikuti polinya */
      if (relSiap && !g.pita) bangunPita(g);
      const [x, y] = g.pita ? titikPita(g, f) : [g.fx + (g.tx - g.fx) * f, g.fy + (g.ty - g.fy) * f];
      feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [x, y] }, properties: g.p });
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

  /* pemeriksa lapisan (dipakai untuk uji tampilan) */
  window.__mapRef = map; /* dipakai untuk uji otomatis */
  window.__rvInfo = () => {
    const n = (id) => { try { return map.queryRenderedFeatures({ layers: [id] }).length; } catch (e) { return -1; } };
    return {
      ikonStasiun: map.hasImage("stasiun-ikon"), ikonKamera: map.hasImage("kamera-ikon"),
      tampilStasiun: n("stasiun-ikon"), tampilKamera: n("kamera-ikon"),
      dataStasiun: map.querySourceFeatures("stasiun").length, dataKamera: map.querySourceFeatures("kamera").length,
      relSiap: relSeg.size > 0, zoom: +map.getZoom().toFixed(2),
      loaded: map.loaded(), gayaSiap: map.isStyleLoaded(), lapis: (map.getStyle()?.layers || []).length, siap,
      layar: (() => { const f = map.queryRenderedFeatures({ layers: ["kereta-titik"] })[0]; if (!f) return null; const q = map.project(f.geometry.coordinates); const r = map.getCanvas().getBoundingClientRect(); return [Math.round(r.left + q.x), Math.round(r.top + q.y), f.geometry.coordinates]; })(),
      tengah: [map.getCenter().lng, map.getCenter().lat],
      tjLayar: (() => { const f = map.queryRenderedFeatures({ layers: ["tj-titik"] })[0]; if (!f) return null; const q = map.project(f.geometry.coordinates); const r = map.getCanvas().getBoundingClientRect(); return [Math.round(r.left + q.x), Math.round(r.top + q.y)]; })(),
      kameraLayar: (() => { const f = map.queryRenderedFeatures({ layers: ["kamera-ikon"] })[0]; if (!f) return null; const q = map.project(f.geometry.coordinates); const r = map.getCanvas().getBoundingClientRect(); return [Math.round(r.left + q.x), Math.round(r.top + q.y), f.properties.nama]; })(),
    };
  };

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

  /* kaca pembesar: 512 px citra di sekitar satu titik */
  function kacaKe(lat, lng, nama = "Area apron") {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const kotak = [
      [lng - KACA_H, lat - KACA_H], [lng + KACA_H, lat - KACA_H],
      [lng + KACA_H, lat + KACA_H], [lng - KACA_H, lat + KACA_H], [lng - KACA_H, lat - KACA_H],
    ];
    map.getSource("kaca")?.setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [kotak] }, properties: {} }],
    });
    const bbox = [lng - KACA_H, lat - KACA_H, lng + KACA_H, lat + KACA_H].map((n) => n.toFixed(5)).join(",");
    const url =
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
      `?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=512,512&format=jpg&f=image`;
    if (onKaca) onKaca({ lat, lng, url, nama, bandara: bandaraKode });
    return url;
  }

  const LAPIS_BANDARA = [
    "bd-landasan", "bd-taksi", "bd-apron", "bd-terminal", "bd-terminal-garis",
    "bd-stand", "bd-gate", "bd-gate-nama", "kaca-isi", "kaca-garis",
  ];
  const atur = (id, v) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v ? "visible" : "none"); };

  /* masuk/keluar mode bandara: satelit + geometri apron */
  async function modeBandara(on, kode = bandaraKode || "CGK") {
    if (!on) {
      bandaraAktif = false;
      atur("satelit", false);
      atur("gedung-3d", true);
      LAPIS_BANDARA.forEach((id) => atur(id, false));
      if (onKaca) onKaca(null);
      return;
    }
    const b = BANDARA[kode];
    if (!b) return;
    bandaraKode = kode;
    bandaraAktif = true;

    let fc = bandaraCache[kode];
    if (!fc) {
      try {
        fc = await fetch(`${b.geo}?v=1`).then((r) => r.json());
        bandaraCache[kode] = fc;
      } catch (e) {
        bandaraAktif = false;
        console.error("BANDARA", e);
        return;
      }
    }
    if (!bandaraAktif || bandaraKode !== kode) return; // dibatalkan saat menunggu

    map.getSource("bandara")?.setData(fc);
    atur("satelit", true);
    atur("gedung-3d", false);
    LAPIS_BANDARA.forEach((id) => atur(id, true));

    map.stop();
    map.flyTo({ center: [b.lng, b.lat], zoom: b.zoom, pitch: 0, bearing: 0, duration: 900 });

    const jumlah = (k) => fc.features.filter((f) => f.properties.aeroway === k).length;
    const gates = fc.features
      .filter((f) => f.properties.aeroway === "gate")
      .map((f) => ({ ref: f.properties.ref || "—", lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
      .sort((x, y) => x.ref.localeCompare(y.ref, "id", { numeric: true }));

    kacaKe(b.lat, b.lng, `Apron ${b.kode}`);

    if (onBandara) onBandara({
      kode, icao: b.icao, nama: b.nama, kota: b.kota, gates,
      jumlah: { gate: jumlah("gate"), stand: jumlah("parking_position"), runway: jumlah("runway"), taxiway: jumlah("taxiway") },
    });
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
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
      map.flyTo({ center: [lng, lat], zoom, pitch: 55, duration: 900 });
    },
    resize() {
      map.resize();
    },
    modeBandara,
    kacaKe,
    bandaraInfo: () => ({ aktif: bandaraAktif, kode: bandaraKode }),
    hentikan() {
      tj?.berhenti();
    },
    map,
  };
}
