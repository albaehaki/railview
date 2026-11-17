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

const SNAP = { tutup: 1, setengah: 0.34, penuh: 0 };

export default function App() {
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const laciRef = useRef(null);
  const tarikRef = useRef({ aktif: false, mulai: 0, awal: 0, geser: 0 });

  const [jam, setJam] = useState("--:--:--");
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get("tab") || "lapisan");
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
  const [cariKam, setCariKam] = useState("");
  const videoRef = useRef(null);
  const daftarRef = useRef([]);
  const [jumlahStasiun, setJumlahStasiun] = useState(0);
  const [rencana, setRencana] = useState(() => localStorage.getItem("rv-rencana") !== "0");
  const [pesawat, setPesawat] = useState(() => localStorage.getItem("rv-pesawat") !== "0");
  const [bandara, setBandara] = useState(() => localStorage.getItem("rv-bandara") === "1");
  const [bandaraKode, setBandaraKode] = useState(() => localStorage.getItem("rv-bandara-kode") || "CGK");
  const [bandaraInfo, setBandaraInfo] = useState(null);
  const [kaca, setKaca] = useState(null);
  const [cariGate, setCariGate] = useState("");
  const [lokasi, setLokasi] = useState(null);
  const [ikutLokasi, setIkutLokasi] = useState(false);
  const [galatLokasi, setGalatLokasi] = useState("");
  const [kartuLokasi, setKartuLokasi] = useState(false);
  const [jawa, setJawa] = useState({ rel: true, stasiun: true, bandara: true, terminal: true, halte: false });
  const [jawaN, setJawaN] = useState({});
  const [zPeta, setZPeta] = useState(9.2);
  const jawaRef = useRef(jawa);
  const watchRef = useRef(null);
  const bandaraRef = useRef(bandara);
  const kodeRef = useRef(bandaraKode);
  const [ringkas, setRingkas] = useState(() => localStorage.getItem("rv-ringkas") !== "0");
  const [laci, setLaci] = useState(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("laci")) return q.get("laci");
    if (q.has("fokus")) return "tutup";
    return localStorage.getItem("rv-laci") || (window.innerWidth < 900 ? "tutup" : "setengah");
  });
  const [geser, setGeser] = useState(null);
  const [detak, setDetak] = useState(0);

  useEffect(() => { localStorage.setItem("rv-laci", laci); }, [laci]);
  useEffect(() => { localStorage.setItem("rv-ringkas", ringkas ? "1" : "0"); }, [ringkas]);
  useEffect(() => { window.__setRencana?.(rencana); }, [rencana]);
  useEffect(() => { window.__setPesawat?.(pesawat); }, [pesawat]);
  useEffect(() => { localStorage.setItem("rv-bandara", bandara ? "1" : "0"); bandaraRef.current = bandara; }, [bandara]);
  useEffect(() => { localStorage.setItem("rv-bandara-kode", bandaraKode); kodeRef.current = bandaraKode; }, [bandaraKode]);
  useEffect(() => { mapRef.current?.modeBandara(bandara, bandaraKode); }, [bandara, bandaraKode]);
  useEffect(() => { if (ikutLokasi && lokasi) mapRef.current?.ikutLokasi(lokasi); }, [lokasi, ikutLokasi]);
  useEffect(() => {
    jawaRef.current = jawa;
    Object.entries(jawa).forEach(([k, v]) => mapRef.current?.setJawa(k, v));
  }, [jawa]);
  useEffect(() => () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current); }, []);

  /* H = buka/tutup laci */
  useEffect(() => {
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key.toLowerCase() !== "h" || e.metaKey || e.ctrlKey) return;
      setLaci((v) => (v === "tutup" ? "setengah" : "tutup"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* daftar kamera */
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
        const urut = [...semua].sort((a, b) => Number(!!b.hidup && !b.hanyaGambar) - Number(!!a.hidup && !a.hanyaGambar));
        setDaftarKamera(urut);
        fetch(`/api/cctv?what=tol&t=${Date.now()}`)
          .then((r) => r.json())
          .then((t) => {
            if (!hidup) return;
            const tol = (t.kamera || []).filter((k) => k.cara === "km").map((k) => ({
              nama: k.nama, judul: k.judul, kota: "Tol", jenis: "hls", hls: k.hls,
              hidup: k.hidup !== false, catatan: k.hidup === false ? `siaran mati · ruas ${k.ruas}` : `ruas ${k.ruas} · titik perkiraan dari nomor KM`,
            }));
            if (tol.length) setDaftarKamera([...urut, ...tol]);
          })
          .catch(() => {});
        const mau = new URLSearchParams(location.search).get("cam");
        setKamera(
          (mau && urut.find((k) => k.nama === mau)) ||
          urut.find((k) => k.hidup !== false && !k.hanyaGambar && k.jenis === "iframe") ||
          urut.find((k) => k.hidup !== false && !k.hanyaGambar) ||
          urut[0]
        );
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
    if (!v || !kamera || tab !== "kamera" || laci === "tutup" || kamera.hanyaGambar || kamera.jenis === "iframe" || kamera.jenis === "embed") return;
    let hls = null;
    let batal = false;
    const url = kamera.hls || `/api/cctv?what=m3u8&n=${encodeURIComponent(kamera.nama)}`;

    (async () => {
      const Hls = (await import("hls.js")).default;
      if (batal) return;
      if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 10 });
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
        hls.on(Hls.Events.ERROR, (_e, d) => {
          window.__hlsErr = JSON.stringify({ t: d.type, d: d.details, code: d.response?.code, url: d.url, frag: d.frag?.url });
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
  }, [kamera, tab, laci]);

  /* gambar terbaru untuk kamera yang videonya diblokir */
  useEffect(() => {
    if (!kamera?.hanyaGambar || tab !== "kamera" || laci === "tutup") return;
    const id = setInterval(() => setDetak((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, [kamera, tab, laci]);

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
        onKamera: () => {},
        onBandara: (info) => setBandaraInfo(info),
        onKaca: (k) => setKaca(k),
        onGeser: () => setIkutLokasi(false),
        onLokasiKlik: () => setKartuLokasi(true),
        onJawa: (jenis, n) => setJawaN((o) => ({ ...o, [jenis]: n })),
        onZoom: (z) => setZPeta(z),
        /* klik kereta: cukup sorot jalurnya, rincian tampil di popup peta */
        onTrain: async (props) => {
          setPilih(props);
          const j = await fetch(`/api/rail?what=jalur&id=${props.id}`).then((r) => r.json());
          if (!hidup) return;
          if (j && j.jalur) {
            setJalur(j);
            mapRef.current?.setJalur(j.garis || j.jalur);
          }
        },
      });
      mapRef.current = map;
      if (bandaraRef.current) map.modeBandara(true, kodeRef.current);
      Object.entries(jawaRef.current).forEach(([k, v]) => { if (v) map.setJawa(k, true); });

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

  useEffect(() => { mapRef.current?.setWarnaGedung(warna); }, [warna]);
  useEffect(() => { mapRef.current?.modeHelikopter(mode === "helikopter"); }, [mode]);

  const ubah = (k, v) => { setWarna((w) => ({ ...w, [k]: v })); setPreset(null); };
  const pakaiPreset = (p) => { setWarna({ low: p.low, mid: p.mid, high: p.high }); setPreset(p.id); };

  const jumlah = (m) => trains.filter((t) => t[2] === m).length;
  const petaNama = new Map(stations.map((s) => [s[0], s[1]]));
  const namaSt = (k) => petaNama.get(k) || k || "—";
  const sisaJalur = jalur ? jalur.jalur.filter((p) => p.st !== jalur.jalur[0].st).slice(0, 6) : [];

  /* ── tarik laci ── */
  const tinggiLaci = () => (laciRef.current?.offsetHeight || 420);
  const geserSekarang = () => {
    if (geser !== null) return geser;
    return SNAP[laci] * tinggiLaci();
  };

  const mulaiTarik = (e) => {
    const t = tarikRef.current;
    t.aktif = true;
    t.mulai = e.clientY;
    t.awal = geserSekarang();
    t.geser = t.awal;
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    document.body.style.userSelect = "none";
  };

  const sedangTarik = (e) => {
    const t = tarikRef.current;
    if (!t.aktif) return;
    const d = e.clientY - t.mulai;
    const maks = tinggiLaci() + 24;
    t.geser = Math.max(-20, Math.min(maks, t.awal + d));
    setGeser(t.geser);
  };

  const lepasTarik = () => {
    const t = tarikRef.current;
    if (!t.aktif) return;
    t.aktif = false;
    document.body.style.userSelect = "";
    const h = tinggiLaci();
    const rasio = t.geser / h;
    let tujuan = "setengah", beda = 9;
    for (const [nama, titik] of [["penuh", 0], ["setengah", SNAP.setengah], ["tutup", 1]]) {
      const d = Math.abs(rasio - titik);
      if (d < beda) { beda = d; tujuan = nama; }
    }
    setGeser(null);
    setLaci(tujuan);
  };

  const bukaLaci = (v) => { setGeser(null); setLaci(v); };

  const hentiLokasi = () => {
    if (watchRef.current != null) { navigator.geolocation.clearWatch(watchRef.current); watchRef.current = null; }
    setLokasi(null); setIkutLokasi(false); setGalatLokasi("");
    mapRef.current?.lokasiSaya(null);
  };

  const toggleLokasi = () => {
    if (watchRef.current != null) return hentiLokasi();
    if (!navigator.geolocation) { setGalatLokasi("peranti ini tidak punya GPS"); return; }
    setGalatLokasi("");
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const o = {
          lat: pos.coords.latitude, lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy || 0), arah: pos.coords.heading, t: Date.now(),
        };
        setLokasi(o);
        mapRef.current?.lokasiSaya(o);
        setIkutLokasi(true);
      },
      (err) => {
        setGalatLokasi(err.code === 1 ? "izin lokasi ditolak" : "lokasi tidak terbaca");
        watchRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">RailView<i>pantau publik</i></div>
        <div className="crumbs"><b>{zPeta < 8 ? "JAWA" : "JABODETABEK"}</b> / {status === "siap" ? "bus & pesawat langsung · kereta perkiraan jadwal" : status === "memuat" ? "memuat…" : "gangguan"}</div>
        <div className="meta">
          <span><b>{trains.length}</b> aktif</span>
          <span><b>{bus}</b> bus</span>
          <span><b>{jumlahStasiun || stations.length || 158}</b> stasiun</span>
        </div>
        <button className="fokus" onClick={() => bukaLaci(laci === "tutup" ? "setengah" : "tutup")} title="Buka/tutup laci (H)">
          {laci === "tutup" ? "laci" : "tutup"} <i>H</i>
        </button>
        <div className="clock">{jam}</div>
      </header>

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
          <button
            onClick={() => mapRef.current?.map?.fitBounds([[105.05, -8.95], [114.65, -5.60]], { padding: 40, duration: 900, pitch: 0, bearing: 0 })}
            title="lihat seluruh Jawa"
          >jawa</button>
        </div>
        <button
          className={"fab-lokasi" + (lokasi ? " aktif" : "") + (ikutLokasi ? " ikut" : "")}
          onClick={toggleLokasi}
          title={lokasi ? "hentikan lokasi" : "tampilkan lokasi saya"}
          aria-label="lokasi saya"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <circle cx="12" cy="12" r="7.4" fill="none" strokeWidth="1.8" />
            <path d="M12 1.6v3.2M12 19.2v3.2M1.6 12h3.2M19.2 12h3.2" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {lokasi && kartuLokasi && (
          <div className="kartu-lokasi">
            <div className="kl-kepala">
              <span className="kl-titik" />
              <div>
                <b>Lokasi Anda</b>
                <span>akurasi ±{lokasi.acc} m · {ikutLokasi ? "kamera mengikuti" : "kamera lepas"}</span>
              </div>
              <button className="kl-x" onClick={() => setKartuLokasi(false)} aria-label="tutup">×</button>
            </div>
            <div className="kl-koord">
              <span>lintang</span><b>{lokasi.lat.toFixed(6)}</b>
              <span>bujur</span><b>{lokasi.lng.toFixed(6)}</b>
            </div>
            <div className="kl-aksi">
              <button onClick={() => { setIkutLokasi(true); mapRef.current?.ikutLokasi(lokasi); }}>
                {ikutLokasi ? "tengah lagi" : "ikuti"}
              </button>
              <button
                onClick={() => {
                  const teks = `${lokasi.lat.toFixed(6)}, ${lokasi.lng.toFixed(6)}`;
                  if (navigator.clipboard) navigator.clipboard.writeText(teks).catch(() => {});
                }}
              >salin koordinat</button>
              <button onClick={hentiLokasi}>hentikan</button>
            </div>
          </div>
        )}

        {lokasi && (
          <div className="gps">
            <b>GPS</b> ±{lokasi.acc} m · {ikutLokasi ? "mengikuti" : "lepas"}
            {!ikutLokasi && <button onClick={() => setIkutLokasi(true)}>ikuti</button>}
          </div>
        )}
        {galatLokasi && <div className="gps err">{galatLokasi}</div>}

        <div className="stagefoot">
          <span><b>LIVE</b> {trains.length} kereta berjalan</span>
          <span>{total.tampil ? `${total.tampil} dari ${total.semua} kereta hari ini` : "—"}</span>
        </div>

        {bandara && kaca && (
          <div className="kaca">
            <header>
              <b>Kaca pembesar</b>
              <span>{kaca.lng.toFixed(4)} · {kaca.lat.toFixed(4)}</span>
            </header>
            <div className="kaca-img"><img src={kaca.url} alt={`Citra ${kaca.nama}`} /><i className="kaca-ring" /></div>
            <footer><b>{kaca.nama}</b><span className="tag">STATIS</span></footer>
            <button className="kaca-x" onClick={() => setKaca(null)} aria-label="tutup kaca pembesar">×</button>
          </div>
        )}
      </main>

      {/* kartu ringkas kanan atas */}
      {ringkas && (
        <div className="ringkas">
          <button className="ringkas-x" onClick={() => setRingkas(false)} aria-label="sembunyikan ringkasan">×</button>
          <h4>Ringkas</h4>
          <div className="rnote">kereta = perkiraan dari jadwal, bukan GPS</div>
          <div className="rbaris"><span className="rdot" style={{ background: WARNA_MODA.K }} />KRL<em>≈{jumlah("K")}</em></div>
          <div className="rbaris"><span className="rdot" style={{ background: "#f08a2c" }} />TransJakarta<em>{bus}</em></div>
          <div className="rbaris"><span className="rdot" style={{ background: WARNA_MODA.L }} />LRT<em>{jumlah("L") + jumlah("J")}</em></div>
          <div className="rbaris"><span className="rdot" style={{ background: "#a9c8e8" }} />Pesawat<em>{pesawat ? "on" : "off"}</em></div>
          <button className="ringkas-buka" onClick={() => bukaLaci(laci === "tutup" ? "setengah" : "tutup")}>
            {laci === "tutup" ? "Buka laci ⌃" : "Tutup laci ⌄"}
          </button>
        </div>
      )}
      {!ringkas && (
        <button className="ringkas-pil" onClick={() => setRingkas(true)}>ringkas</button>
      )}

      {/* laci tunggal */}
      <section
        className={"laci" + (laci === "tutup" && geser === null ? " tertutup" : "")}
        ref={laciRef}
        style={geser !== null ? { transform: `translate(-50%, ${geser}px)`, transition: "none" } : undefined}
        aria-hidden={laci === "tutup"}
      >
        <div
          className="pegang"
          onPointerDown={mulaiTarik}
          onPointerMove={sedangTarik}
          onPointerUp={lepasTarik}
          onPointerCancel={lepasTarik}
          role="separator"
          aria-label="tarik laci"
        >
          <i />
        </div>
        <button className="laci-x" onClick={() => bukaLaci("tutup")} aria-label="tutup laci" title="Tutup laci">×</button>

        <div className="ltab">
          <button className={"lt" + (tab === "lapisan" ? " on" : "")} onClick={() => setTab("lapisan")}>
            Lapisan <u>{["K", "M", "L", "J", "W", "A", "B"].filter((m) => jumlah(m)).length + 2}</u>
          </button>
          <button className={"lt" + (tab === "kamera" ? " on" : "")} onClick={() => setTab("kamera")}>
            Kamera <u>{daftarKamera.length || "—"}</u>
          </button>
          <button className={"lt" + (tab === "bandara" ? " on" : "")} onClick={() => setTab("bandara")}>
            Bandara <u>{bandara ? bandaraInfo?.jumlah?.gate ?? "on" : "off"}</u>
          </button>
          <button className={"lt" + (tab === "warna" ? " on" : "")} onClick={() => setTab("warna")}>
            Warna
          </button>
        </div>

        <div className="lisi">
          {tab === "lapisan" && (
            <div className="lgrid">
              <div className="kartu">
                <h5>Pencarian</h5>
                <div className="cari"><span>cari kereta, stasiun, kamera</span><b>⌘K</b></div>
                <h5>Lapisan</h5>
                <div className="pil">
                  <span className="hidup"><i style={{ background: "#f08a2c" }} />TransJakarta<b>{bus}</b></span>
                  <span
                    className={bandara ? "hidup" : "mati"}
                    onClick={() => setBandara((v) => !v)}
                  ><i style={{ background: "#d9a24b" }} />Mode bandara<b>{bandara ? bandaraKode : "off"}</b></span>
                  <span
                    className={pesawat ? "hidup" : "mati"}
                    onClick={() => { const v = !pesawat; setPesawat(v); localStorage.setItem("rv-pesawat", v ? "1" : "0"); }}
                  ><i style={{ background: "#a9c8e8" }} />Pesawat live<b>{pesawat ? "on" : "off"}</b></span>
                  <span
                    className={rencana ? "hidup" : "mati"}
                    onClick={() => { const v = !rencana; setRencana(v); localStorage.setItem("rv-rencana", v ? "1" : "0"); }}
                  ><i style={{ background: "#c07be0" }} />Jalur rencana<b>{rencana ? "on" : "off"}</b></span>
                  <span className="hidup"><i style={{ background: "#8FA7C4" }} />Stasiun<b>{jumlahStasiun || 158}</b></span>
                  {[
                    { k: "rel", n: "Rel Jawa", c: "#6f7f63" },
                    { k: "stasiun", n: "Stasiun Jawa", c: "#9fb3c8" },
                    { k: "bandara", n: "Bandara", c: "#ffcf7a" },
                    { k: "terminal", n: "Terminal bus", c: "#7fd6b0" },
                    { k: "halte", n: "Halte", c: "#58a874" },
                  ].map((x) => (
                    <span
                      key={x.k}
                      className={jawa[x.k] ? "hidup" : "mati"}
                      onClick={() => setJawa((o) => ({ ...o, [x.k]: !o[x.k] }))}
                    >
                      <i style={{ background: x.c }} />{x.n}
                      <b>{jawa[x.k] ? (jawaN[x.k] ?? "on") : "off"}</b>
                    </span>
                  ))}
                </div>
                <h5 style={{ marginTop: 14 }}>Keterangan</h5>
                <div className="legend">
                  {["K", "M", "L", "J", "W"].map((m) => (
                    <span key={m}><i style={{ background: WARNA_MODA[m] }} />{MODA[m]}</span>
                  ))}
                  <span><i style={{ background: "#f08a2c" }} />TransJakarta BRT</span>
                  <span><i style={{ background: "#4fd1b5" }} />Mikrotrans</span>
                </div>
              </div>

              <div className="kartu">
                <h5>Wilayah</h5>
                <div className="pil">
                  {["Semua", "Jakarta", "Bekasi", "Bogor", "Tangerang"].map((w) => (
                    <span key={w} className={wilayah === w ? "hidup" : ""} onClick={() => setWilayah(w)}>{w}</span>
                  ))}
                </div>
                <h5 style={{ marginTop: 14 }}>Catatan data</h5>
                <p className="note">
                  Posisi kereta dihitung dari jadwal GAPEKA dan titik jalur, bukan GPS tiap kereta.
                  Bus TransJakarta langsung dari broker publik. Pesawat dari adsb.lol.
                </p>
              </div>
            </div>
          )}

          {tab === "bandara" && (
            <div className="lgrid">
              <div className="kartu">
                <h5>Bandara</h5>
                <div className="pil">
                  {[
                    { k: "CGK", n: "Soekarno–Hatta" },
                    { k: "HLP", n: "Halim" },
                  ].map((b) => (
                    <span
                      key={b.k}
                      className={bandara && bandaraKode === b.k ? "hidup" : ""}
                      onClick={() => { setBandaraKode(b.k); setBandara(true); }}
                    >{b.k}</span>
                  ))}
                  <span
                    className={bandara ? "mati" : "hidup"}
                    onClick={() => setBandara((v) => !v)}
                  >{bandara ? "matikan satelit" : "aktifkan satelit"}</span>
                </div>

                {bandaraInfo ? (
                  <>
                    <h5 style={{ marginTop: 14 }}>{bandaraInfo.nama} · {bandaraInfo.kode}/{bandaraInfo.icao}</h5>
                    <div className="bstat">
                      <div><span>gate</span><b>{bandaraInfo.jumlah.gate}</b></div>
                      <div><span>stand</span><b>{bandaraInfo.jumlah.stand}</b></div>
                      <div><span>landasan</span><b>{bandaraInfo.jumlah.runway}</b></div>
                    </div>
                  </>
                ) : (
                  <p className="note">Pilih CGK atau HLP untuk memuat apron &amp; gate.</p>
                )}

                <h5 style={{ marginTop: 14 }}>Catatan data</h5>
                <p className="note">
                  Citra satelit Esri itu <b>potret statis</b>, bukan siaran langsung: pesawat yang terlihat sedang bersandar
                  pada saat citra diambil. Pesawat parkir mematikan transponder, jadi tidak muncul di lapisan ADS-B.
                  Gate &amp; marka stand dari OpenStreetMap.
                </p>
              </div>

              <div className="kartu">
                <h5>Gate {bandaraInfo ? <em className="kecil">{bandaraInfo.gates.length}</em> : null}</h5>
                <input
                  className="cari-gate"
                  value={cariGate}
                  onChange={(e) => setCariGate(e.target.value)}
                  placeholder="cari gate — F1, A3, 1C"
                />
                <div className="daftar-gate">
                  {(bandaraInfo?.gates || [])
                    .filter((g) => g.ref.toLowerCase().includes(cariGate.trim().toLowerCase()))
                    .slice(0, 80)
                    .map((g) => (
                      <button
                        key={g.ref}
                        className="gbtn"
                        onClick={() => {
                          mapRef.current?.map?.flyTo({ center: [g.lng, g.lat], zoom: 18.4, pitch: 0, bearing: 0, duration: 700 });
                          mapRef.current?.kacaKe(g.lat, g.lng, `Gate ${g.ref}`);
                        }}
                      >
                        <b>{g.ref}</b><span>kontak gate</span>
                      </button>
                    ))}
                  {bandaraInfo && !bandaraInfo.gates.length && <p className="note">Bandara ini belum punya data gate di OSM.</p>}
                </div>
              </div>
            </div>
          )}

          {tab === "kamera" && (
            <div className="kamgrid">
              <div className="kartu kamplay">
                <div className="kamhead">
                  <b>{kamera?.judul || "pilih kamera"}</b>
                  <span className={"kst" + (kamera?.hidup === false ? " mati" : kamera?.hanyaGambar ? " img" : "")}>
                    {kamera?.hanyaGambar ? "gambar 10 dtk" : kamera?.hidup === false ? "mati" : "siaran"}
                  </span>
                </div>
                <div className="kambodi">
                  {!kamera ? (
                    <div className="kamkosong">daftar kamera belum termuat…</div>
                  ) : kamera.hanyaGambar && kamera.foto ? (
                    <img className="kammed" src={kamera.foto} alt="" />
                  ) : kamera.jenis === "iframe" || kamera.jenis === "embed" ? (
                    <iframe className="kammed" src={kamera.embed || kamera.foto} allow="autoplay; fullscreen" loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <video className="kammed" ref={videoRef} muted playsInline controls />
                  )}
                </div>
                <div className="kamkaki">
                  <span>{kamera?.kota || "—"}</span>
                  <span>{kamera?.catatan || "siaran publik · tidak direkam"}</span>
                </div>
              </div>

              <div className="kartu kamlist">
                <input
                  className="kamcari"
                  value={cariKam}
                  onChange={(e) => setCariKam(e.target.value)}
                  placeholder="cari kamera · jalan · kota · ruas tol"
                />
                <div className="kamrows">
                  {(cariKam.trim()
                    ? daftarKamera.filter((k) => `${k.judul} ${k.kota}`.toLowerCase().includes(cariKam.trim().toLowerCase()))
                    : daftarKamera
                  ).slice(0, 300).map((k) => (
                    <button
                      key={k.nama}
                      className={"kamrow" + (k.nama === kamera?.nama ? " on" : "")}
                      onClick={() => setKamera(k)}
                    >
                      <i className={k.hidup === false ? "mati" : k.hanyaGambar ? "img" : "live"} />
                      <span><b>{k.judul}</b><em>{k.kota}</em></span>
                    </button>
                  ))}
                  {!daftarKamera.length && <p className="note">belum ada kamera yang bisa dimuat.</p>}
                </div>
              </div>
            </div>
          )}

          {tab === "warna" && (
            <div className="lgrid">
              <div className="kartu">
                <h5>Warna gedung</h5>
                <div className="tones">
                  <label className="tone">rendah<em>{warna.low}</em><input type="color" value={warna.low} onChange={(e) => ubah("low", e.target.value)} /></label>
                  <label className="tone">sedang<em>{warna.mid}</em><input type="color" value={warna.mid} onChange={(e) => ubah("mid", e.target.value)} /></label>
                  <label className="tone">tinggi<em>{warna.high}</em><input type="color" value={warna.high} onChange={(e) => ubah("high", e.target.value)} /></label>
                </div>
              </div>
              <div className="kartu">
                <h5>Preset</h5>
                <div className="pil">
                  {PRESETS.map((p) => (
                    <span key={p.id} className={preset === p.id ? "hidup" : ""} onClick={() => pakaiPreset(p)}>{p.name}</span>
                  ))}
                </div>
                <div className="acts" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => { setWarna(acak()); setPreset(null); }}>Acak warna</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {laci === "tutup" && geser === null && !ringkas && (
        <button className="bukaLaci" onClick={() => bukaLaci("setengah")}>Laci ⌃</button>
      )}
    </div>
  );
}
