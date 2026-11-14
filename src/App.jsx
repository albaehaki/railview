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
  const [bus, setBus] = useState(0);
  const [kamera, setKamera] = useState(null);
  const [daftarKamera, setDaftarKamera] = useState([]);
  const videoRef = useRef(null);
  const daftarRef = useRef([]);
  const [jumlahStasiun, setJumlahStasiun] = useState(0);
  const [rencana, setRencana] = useState(() => localStorage.getItem("rv-rencana") !== "0");
  const sempit = typeof window !== "undefined" && window.innerWidth < 900;
  const paksaFokus = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fokus");
  const [kiri, setKiri] = useState(() => (sempit || paksaFokus ? false : localStorage.getItem("rv-kiri") !== "0"));
  const [kanan, setKanan] = useState(() => (sempit || paksaFokus ? false : localStorage.getItem("rv-kanan") !== "0"));
  const paksaBawah = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("bawah") === "1";
  const [bawah, setBawah] = useState(() => (paksaBawah ? true : sempit || paksaFokus ? false : localStorage.getItem("rv-bawah") !== "0"));

  /* simpan pilihan panel + tombol fokus (H) */
  useEffect(() => { localStorage.setItem("rv-kiri", kiri ? "1" : "0"); }, [kiri]);
  useEffect(() => { localStorage.setItem("rv-kanan", kanan ? "1" : "0"); }, [kanan]);
  useEffect(() => { localStorage.setItem("rv-bawah", bawah ? "1" : "0"); }, [bawah]);
  useEffect(() => { window.__setRencana?.(rencana); }, [rencana]);

  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key.toLowerCase() !== "h" || e.metaKey || e.ctrlKey) return;
      const ada = kiri || kanan || bawah;
      setKiri(!ada);
      setKanan(!ada);
      setBawah(!ada);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kiri, kanan, bawah]);

  /* klik kereta → panel kanan muncul sendiri */
  useEffect(() => { if (pilih) setKanan(true); }, [pilih]);

  /* daftar kamera — diulang kalau fungsi server baru bangun (cold start) */
  useEffect(() => {
    let hidup = true;
    let coba = 0;
    const ambil = async () => {
      try {
        const d = await fetch(`/api/cctv?what=list&t=${Date.now()}`).then((r) => r.json());
        if (!hidup) return;
        const semua = d.kamera || [];
        if (!semua.length) throw new Error("kosong");
        daftarRef.current = semua;
        setDaftarKamera(semua);
        setKamera(semua.find((k) => k.jenis === "iframe" && k.hidup !== false) || semua.find((k) => k.hidup !== false) || semua[0]);
      } catch {
        if (hidup && coba++ < 6) setTimeout(ambil, 3000);
      }
    };
    ambil();
    return () => { hidup = false; };
  }, []);

  /* siaran HLS */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !kamera || tab !== "kamera" || kamera.jenis === "iframe") return;
    let hls = null;
    let batal = false;
    const url = `/api/cctv?what=m3u8&n=${encodeURIComponent(kamera.nama)}`;

    (async () => {
      const Hls = (await import("hls.js")).default;
      if (batal) return;
      if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 10 });
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
        hls.on(Hls.Events.ERROR, (_e, d) => {
          window.__hlsErr = JSON.stringify({ t: d.type, d: d.details, code: d.response?.code, url: d.url, frag: d.frag?.url, txt: d.response?.text });
          console.warn("HLS", window.__hlsErr);
        });
      } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = url;
        v.play().catch(() => {});
      }
    })();

    return () => {
      batal = true;
      if (hls) hls.destroy();
      v.removeAttribute("src");
      v.load();
    };
  }, [kamera, tab]);

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
        onBus: (n) => setBus(n),
        onStasiun: (n) => setJumlahStasiun(n),
        onKamera: (nama) => {
          const k = daftarRef.current.find((x) => x.nama === nama);
          if (!k) return;
          setKamera(k);
          setTab("kamera");
          setKanan(true);
        },
        onTrain: async (props) => {
          setPilih(props);
          setTab("kereta");
          const j = await fetch(`/api/rail?what=jalur&id=${props.id}`).then((r) => r.json());
          if (!hidup) return;
          if (j && j.jalur) {
            setJalur(j);
            mapRef.current?.setJalur(j.garis || j.jalur);
            /* tidak menggeser peta saat kereta diklik — cukup panel + garis rute */
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
            fetch(`/api/rail?what=trains&t=${Date.now()}`).then((r) => r.json()),
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
          if (hidup) {
            setStatus((s) => (s === "siap" ? s : "gangguan"));
            setTimeout(() => { if (hidup) muat(); }, 5000);
          }
        }
      };

      map.map.once("load", muat);
      muat();

      timer = setInterval(() => {
        if (document.visibilityState === "visible") muat();
      }, 10000);

      const onVis = () => {
        if (document.visibilityState === "visible") muat();
      };
      document.addEventListener("visibilitychange", onVis);

      return () => document.removeEventListener("visibilitychange", onVis);
    })();

    return () => {
      hidup = false;
      if (timer) clearInterval(timer);
      mapRef.current?.hentikan();
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
    <div className={"app" + (kiri ? "" : " kiri-tutup") + (kanan ? "" : " kanan-tutup") + (bawah ? "" : " bawah-tutup")}>
      <header className="topbar">
        <div className="brand">RailView<i>pantau publik</i></div>
        <div className="crumbs"><b>JABODETABEK</b> / {status === "siap" ? "data langsung" : status === "memuat" ? "memuat…" : "gangguan"}</div>
        <div className="meta">
          <span><b>{trains.length}</b> aktif</span>
          <span><b>{total.semua || 2.392}</b> hari ini</span>
          <span><b>{jumlahStasiun || stations.length || 85}</b> stasiun</span>
        </div>
        <button
          className="fokus"
          onClick={() => { const ada = kiri || kanan || bawah; setKiri(!ada); setKanan(!ada); setBawah(!ada); }}
          title="Sembunyikan semua panel (H)"
        >
          {kiri || kanan ? "fokus" : "panel"} <i>H</i>
        </button>
        <div className="clock">{jam}</div>
      </header>

      <button className="lipat lipat-kiri" onClick={() => setKiri((v) => !v)} title={kiri ? "Sembunyikan panel kiri" : "Tampilkan panel kiri"}>
        {kiri ? "‹" : "›"}
      </button>

      <aside className="rail">
        <button className="tutup-drawer" onClick={() => setKiri(false)} aria-label="tutup panel kiri">×</button>
        <div>
          <div className="search">
            <input placeholder="cari kereta, stasiun, kamera" aria-label="cari" />
            <span className="kbd">⌘K</span>
          </div>
        </div>

        <div>
          <div className="label">Lapisan</div>
          <div className="layer on">
            <span className="sw" style={{ background: "linear-gradient(90deg,#f08a2c 55%,#4fd1b5 55%)" }} />
            TransJakarta
            <span className="n">{bus}</span>
          </div>
          <div
            className={"layer" + (rencana ? " on" : "")}
            onClick={() => { const v = !rencana; setRencana(v); localStorage.setItem("rv-rencana", v ? "1" : "0"); }}
            style={{ cursor: "pointer" }}
          >
            <span className="sw" style={{ background: "repeating-linear-gradient(90deg,#c07be0 0 4px,transparent 4px 7px)" }} />
            Jalur rencana
            <span className="n">{rencana ? "on" : "off"}</span>
          </div>
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
            <span><i style={{ background: "#f08a2c" }} />TransJakarta BRT</span>
            <span><i style={{ background: "#4fd1b5" }} />Mikrotrans</span>
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

      {kiri && <div className="tirai" onClick={() => setKiri(false)} />}

      <button className="lipat lipat-kanan" onClick={() => setKanan((v) => !v)} title={kanan ? "Sembunyikan panel kanan" : "Tampilkan panel kanan"}>
        {kanan ? "›" : "‹"}
      </button>

      <aside className="panel">
        <button className="tutup-panel" onClick={() => setKanan(false)} aria-label="tutup panel kanan">×</button>
        <div className="ptabs">
          <button className={"ptab" + (tab === "kamera" ? " on" : "")} onClick={() => setTab("kamera")}>kamera</button>
          <button className={"ptab" + (tab === "kereta" ? " on" : "")} onClick={() => setTab("kereta")}>kereta</button>
          <span className="plive"><u />live</span>
        </div>

        {tab === "kamera" ? (
          <div className="pane">
            <div className="phead">
              <div className="eyebrow">kamera · {kamera?.kota?.toLowerCase() || "jabodetabek"} <em>siaran</em></div>
              <h1>{kamera ? kamera.judul : "memuat kamera…"}</h1>
              <div className="sub">{daftarKamera.length} kamera publik · video langsung</div>
            </div>
            <div className="frame">
              {kamera?.jenis === "iframe" ? (
                <iframe
                  key={kamera.nama}
                  src={kamera.embed}
                  title={kamera.judul}
                  allow="autoplay; fullscreen"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <video ref={videoRef} poster={kamera?.foto} muted playsInline autoPlay />
              )}
              <div className="grain" />
              <div className="rec"><u />LANGSUNG</div>
              <div className="stamp">{jam} · 14 NOV 2026</div>
            </div>
            <div className="src"><span>sumber: bekasikota.go.id</span><span>hls · proxy</span></div>
            <select
              className="camselect"
              value={kamera?.nama || ""}
              onChange={(e) => setKamera(daftarKamera.find((k) => k.nama === e.target.value) || null)}
            >
              {daftarKamera.map((k) => (
                <option key={k.nama} value={k.nama}>{k.judul}{k.hidup === false ? " · offline" : ""}</option>
              ))}
            </select>
            <div className="rows">
              <div className="row"><span>Pengelola</span><b>Pemkot Bekasi</b></div>
              <div className="row"><span>Kamera</span><b>{kamera?.nama || "—"}</b></div>
              <div className="row"><span>Format</span><b>HLS · 1080p</b></div>
              <div className="row"><span>Status</span><b>siaran publik</b></div>
            </div>
            <div className="acts">
              <button className="btn primary" onClick={() => kamera && window.open(kamera.foto, "_blank")}>Buka sumber</button>
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
        <button className="lipat-bawah" onClick={() => setBawah(false)} title="Sembunyikan daftar kereta">
          sembunyikan ⌄
        </button>
        <div className="thead"><span>kereta berjalan sekarang</span><span>·</span><span>10 detik</span></div>
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

      {!bawah && (
        <button className="buka-bawah" onClick={() => setBawah(true)} title="Tampilkan daftar kereta">
          daftar kereta ⌃
        </button>
      )}
    </div>
  );
}
