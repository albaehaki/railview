import { useEffect, useRef, useState } from "react";

const PRESETS = [
  { id: "hijau", name: "malam hijau", low: "#252d20", mid: "#2f3728", high: "#3a4432" },
  { id: "beton", name: "beton", low: "#2a2a29", mid: "#343432", high: "#3f3f3c" },
  { id: "senja", name: "senja", low: "#3a2b22", mid: "#4a3627", high: "#5b4230" },
  { id: "biru", name: "biru malam", low: "#212b34", mid: "#293643", high: "#334250" },
  { id: "arang", name: "arang", low: "#202020", mid: "#2a2a2a", high: "#343434" },
];

function hsl(h, s, l) {
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const acak = () => {
  const hue = Math.floor(Math.random() * 360);
  return { low: hsl(hue, 14, 14), mid: hsl(hue, 15, 19), high: hsl(hue, 16, 24) };
};

const MODA = { K: "KRL", M: "MRT", L: "LRT Jabodebek", J: "LRT Jakarta", W: "Whoosh", A: "antarkota", B: "barang" };
const WARNA_MODA = { K: "#58a874", M: "#e0524a", L: "#4a86e0", J: "#d969b0", W: "#9b6bd6", A: "#e6ece1", B: "#d9a24b" };

export default function App() {
  const boxRef = useRef(null);
  const mapRef = useRef(null);

  const [jam, setJam] = useState("--:--:--");
  const [tab, setTab] = useState("kamera");
  const [mode, setMode] = useState("helikopter");
  const [warna, setWarna] = useState({ low: "#252d20", mid: "#2f3728", high: "#3a4432" });
  const [preset, setPreset] = useState("hijau");
  const [wilayah, setWilayah] = useState("Semua");
  const [trains, setTrains] = useState([]);
  const [stations, setStations] = useState([]);
  const [total, setTotal] = useState({ tampil: 0, semua: 0 });
  const [pilih, setPilih] = useState(null);
  const [jalur, setJalur] = useState(null);
  const [status, setStatus] = useState("memuat");

  /* jam */
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      setJam(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  /* peta + data */
  useEffect(() => {
    let hidup = true;
    let timer = null;

    (async () => {
      const { createMap } = await import("./map/createMap.js");
      if (!hidup || !boxRef.current) return;

      const map = createMap(boxRef.current, {
        onTrain: async (props) => {
          setPilih(props);
          setTab("kereta");
          const j = await fetch(`/api/rail?what=jalur&id=${props.id}`).then((r) => r.json());
          if (!hidup) return;
          if (j && j.jalur) {
            setJalur(j);
            mapRef.current?.setJalur(j.garis || j.jalur);
            const last = j.jalur[0];
            if (last) mapRef.current?.flyKe(last.lng, last.lat, 12.4);
          }
        },
      });
      mapRef.current = map;

      /* dev saja: tunggu peta idle, lalu ubah kanvas jadi gambar (WebGL headless sering hitam) */
      if (import.meta.env.DEV && new URLSearchParams(location.search).has("snap")) {
        let sudah = false;
        const potret = () => {
          if (sudah) return;
          sudah = true;
          try {
            const n = (id) => { try { return map.map.queryRenderedFeatures({ layers: [id] }).length; } catch (e) { return "x"; } };
            document.title = "DIAG gedung=" + n("gedung-3d") + " stasiun=" + n("stasiun-titik") +
              " kereta=" + n("kereta-titik") + " zoom=" + map.map.getZoom().toFixed(2) +
              " idle=" + map.map.loaded();
            const c = map.map.getCanvas();
            const img = new Image();
            img.src = c.toDataURL("image/png");
            img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1";
            map.map.getContainer().appendChild(img);
          } catch (e) {
            console.warn("snap gagal", e);
          }
        };
        map.map.once("idle", () => setTimeout(potret, 800));
        setTimeout(potret, 20000);
      }

      const muat = async () => {
        try {
          const [t, s] = await Promise.all([
            fetch("/api/rail?what=trains").then((r) => r.json()),
            fetch("/api/rail?what=stations").then((r) => r.json()),
          ]);
          if (!hidup) return;
          if (t.error) throw new Error(t.error);
          setTrains(t.trains || []);
          setTotal({ tampil: t.total_tampil || 0, semua: t.total_semua || 0 });
          map.setTrains(t.trains || []);
          if (s && s.stations) {
            setStations(s.stations);
            map.setStations(s.stations);
          }
          setStatus("siap");
        } catch (e) {
          if (hidup) setStatus("gangguan");
        }
      };

      map.map.once("load", muat);
      muat();

      timer = setInterval(() => {
        if (document.visibilityState === "visible") muat();
      }, 20000);

      const onVis = () => {
        if (document.visibilityState === "visible") muat();
      };
      document.addEventListener("visibilitychange", onVis);

      return () => document.removeEventListener("visibilitychange", onVis);
    })();

    return () => {
      hidup = false;
      if (timer) clearInterval(timer);
      mapRef.current?.map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.setWarnaGedung(warna);
  }, [warna]);

  useEffect(() => {
    mapRef.current?.modeHelikopter(mode === "helikopter");
  }, [mode]);

  const ubah = (k, v) => {
    setWarna((w) => ({ ...w, [k]: v }));
    setPreset(null);
  };

  const pakaiPreset = (p) => {
    setWarna({ low: p.low, mid: p.mid, high: p.high });
    setPreset(p.id);
  };

  const jumlah = (m) => trains.filter((t) => t[2] === m).length;
  const petaNama = new Map(stations.map((s) => [s[0], s[1]]));
  const namaSt = (k) => petaNama.get(k) || k || "—";
  const sisaJalur = jalur ? jalur.jalur.filter((p) => p.st !== jalur.jalur[0].st).slice(0, 6) : [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">RailView<i>pantau publik</i></div>
        <div className="crumbs"><b>JABODETABEK</b> / {status === "siap" ? "data langsung" : status === "memuat" ? "memuat…" : "gangguan"}</div>
        <div className="meta">
          <span><b>{trains.length}</b> aktif</span>
          <span><b>{total.semua || 2.392}</b> hari ini</span>
          <span><b>{stations.length || 85}</b> stasiun</span>
        </div>
        <div className="clock">{jam}</div>
      </header>

      <aside className="rail">
        <div>
          <div className="search">
            <input placeholder="cari kereta, stasiun, kamera" aria-label="cari" />
            <span className="kbd">⌘K</span>
          </div>
        </div>

        <div>
          <div className="label">Lapisan</div>
          {["K", "M", "L", "J", "W", "A", "B"].map((m) => (
            <div className="layer on" key={m}>
              <span className="sw" style={{ background: WARNA_MODA[m] }} />
              {MODA[m]}
              <span className="n">{jumlah(m)}</span>
            </div>
          ))}
        </div>

        <div>
          <div className="label">Warna gedung</div>
          <div className="tones">
            <label className="tone">rendah<em>{warna.low}</em>
              <input type="color" value={warna.low} onChange={(e) => ubah("low", e.target.value)} />
            </label>
            <label className="tone">sedang<em>{warna.mid}</em>
              <input type="color" value={warna.mid} onChange={(e) => ubah("mid", e.target.value)} />
            </label>
            <label className="tone">tinggi<em>{warna.high}</em>
              <input type="color" value={warna.high} onChange={(e) => ubah("high", e.target.value)} />
            </label>
          </div>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.id} className={"preset" + (preset === p.id ? " on" : "")} onClick={() => pakaiPreset(p)}>
                {p.name}
              </button>
            ))}
          </div>
          <button className="acak" onClick={() => { setWarna(acak()); setPreset(null); }}>Acak warna</button>
        </div>

        <div>
          <div className="label">Wilayah</div>
          <div className="filters">
            {["Semua", "Jakarta", "Bekasi", "Bogor", "Tangerang"].map((w) => (
              <button key={w} className={"chip" + (wilayah === w ? " on" : "")} onClick={() => setWilayah(w)}>{w}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Keterangan</div>
          <div className="legend">
            {["K", "M", "L", "J", "W"].map((m) => (
              <span key={m}><i style={{ background: WARNA_MODA[m] }} />{MODA[m]}</span>
            ))}
            <span><i style={{ background: "#8FA7C4" }} />stasiun</span>
          </div>
        </div>

        <div className="note">
          Posisi dihitung dari jadwal GAPEKA dan titik jalur, bukan GPS tiap kereta.
          Sumber data: 168railway. Peta: OpenFreeMap / OpenStreetMap.
        </div>
      </aside>

      <main className="stage">
        <div id="map" ref={boxRef} />
        {status !== "siap" && (
          <div className="skeleton">
            <div className="sk"></div>
            <span>{status === "memuat" ? "menyiapkan peta & data kereta…" : "data belum bisa diambil, coba lagi sebentar"}</span>
          </div>
        )}
        <div className="modes">
          <button className={mode === "helikopter" ? "on" : ""} onClick={() => setMode("helikopter")}>helikopter</button>
          <button className={mode === "datar" ? "on" : ""} onClick={() => setMode("datar")}>datar</button>
        </div>
        <div className="stagefoot">
          <span><b>LIVE</b> {trains.length} kereta berjalan</span>
          <span>{total.tampil ? `${total.tampil} dari ${total.semua} kereta hari ini` : "—"}</span>
        </div>
      </main>

      <aside className="panel">
        <div className="ptabs">
          <button className={"ptab" + (tab === "kamera" ? " on" : "")} onClick={() => setTab("kamera")}>kamera</button>
          <button className={"ptab" + (tab === "kereta" ? " on" : "")} onClick={() => setTab("kereta")}>kereta</button>
          <span className="plive"><u />live</span>
        </div>

        {tab === "kamera" ? (
          <div className="pane">
            <div className="phead">
              <div className="eyebrow">kamera · bekasi <em>siaran</em></div>
              <h1>Jl Chairil Anwar<br />DPRD Kota Bekasi</h1>
              <div className="sub">Kamera lalu lintas · arah barat · 1080p</div>
            </div>
            <div className="frame">
              <img src="https://i0.wp.com/pemkotbekasi.github.io/cctv_pic/Jl_Chairil_Anwar_DPRD_Kota_Bekasi.jpg" alt="Bingkai kamera Jl Chairil Anwar" />
              <div className="grain" />
              <div className="rec"><u />LANGSUNG</div>
              <div className="stamp">{jam} · 14 NOV 2026</div>
            </div>
            <div className="src"><span>thumbnail resmi Pemkot Bekasi</span><span>hls · 4 dtk</span></div>
            <div className="rows">
              <div className="row"><span>Pengelola</span><b>Pemkot Bekasi</b></div>
              <div className="row"><span>Koordinat</span><b>-6.2349, 106.9896</b></div>
              <div className="row"><span>Jarak ke rel</span><b>240 m</b></div>
              <div className="row"><span>Kereta terdekat</span><b>KRL 1732 · 1,8 km</b></div>
            </div>
            <div className="acts">
              <button className="btn primary">Buka sumber</button>
              <button className="btn">Sematkan</button>
            </div>
          </div>
        ) : (
          <div className="pane">
            <div className="phead">
              <div className="eyebrow">kereta · {pilih ? MODA[pilih.moda] || "antarkota" : "pilih di peta"} <em>berjalan</em></div>
              <h1>{pilih ? pilih.kode : "Belum ada kereta dipilih"}</h1>
              <div className="sub">
                {jalur ? `${jalur.relasi || "—"} · ${jalur.jalur.length} titik jalur` : "klik titik kereta di peta untuk melihat jalurnya"}
              </div>
            </div>

            {pilih && (
              <div className="rows">
                <div className="row"><span>Stasiun berikut</span><b>{namaSt(pilih.next)}</b></div>
                <div className="row"><span>Arah</span><b>{pilih.arah}°</b></div>
                <div className="row"><span>Posisi</span><b>{pilih.lat}, {pilih.lng}</b></div>
                <div className="row"><span>Kode</span><b>{pilih.id}</b></div>
              </div>
            )}

            {sisaJalur.length > 0 && (
              <div className="routes">
                <div className="label">Sisa jalur</div>
                {sisaJalur.map((p) => (
                  <div className="rst-item" key={p.st + p.lat}>
                    <s />
                    <span>{p.nama}</span>
                    <em>{p.st}</em>
                  </div>
                ))}
              </div>
            )}

            <div className="acts">
              <button className="btn primary" disabled={!pilih} onClick={() => pilih && mapRef.current?.flyKe(pilih.lng, pilih.lat, 14)}>
                Ikuti kereta
              </button>
              <button className="btn" onClick={() => mapRef.current?.map?.flyTo({ center: [106.86, -6.22], zoom: 9.2, pitch: 55 })}>
                Seluruh Jabodetabek
              </button>
            </div>
          </div>
        )}
      </aside>

      <footer className="ticker">
        <div className="thead"><span>kereta berjalan sekarang</span><span>·</span><span>20 detik</span></div>
        <div className="trows">
          {trains.slice(0, 4).map((t) => (
            <div className="trow" key={t[0]}>
              <span className="t">{t[1]}</span>
              <span className="n">{MODA[t[2]] || "KA"}</span>
              <span className="r">menuju {namaSt(t[6])}</span>
              <span className="st">{t[5]}°</span>
            </div>
          ))}
          {trains.length === 0 && <div className="trow"><span className="r">menunggu data…</span></div>}
        </div>
      </footer>
    </div>
  );
}
