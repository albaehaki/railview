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

const SNAP = { tutup: 1, setengah: 0.42, penuh: 0 };

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
  const videoRef = useRef(null);
  const daftarRef = useRef([]);
  const [jumlahStasiun, setJumlahStasiun] = useState(0);
  const [rencana, setRencana] = useState(() => localStorage.getItem("rv-rencana") !== "0");
  const [pesawat, setPesawat] = useState(() => localStorage.getItem("rv-pesawat") !== "0");
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
        setDaftarKamera(semua);
        const urut = [...semua].sort((a, b) => Number(!!b.hidup && !b.hanyaGambar) - Number(!!a.hidup && !a.hanyaGambar));
        setDaftarKamera(urut);
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
        onKamera: (nama) => {
          const k = daftarRef.current.find((x) => x.nama === nama);
          if (!k) return;
          setKamera(k);
          setTab("kamera");
          setLaci("penuh");
        },
        onTrain: async (props) => {
          setPilih(props);
          setTab("kereta");
          setLaci((v) => (v === "tutup" ? "setengah" : v));
          const j = await fetch(`/api/rail?what=jalur&id=${props.id}`).then((r) => r.json());
          if (!hidup) return;
          if (j && j.jalur) {
            setJalur(j);
            mapRef.current?.setJalur(j.garis || j.jalur);
          }
        },
      });
      mapRef.current = map;

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
    let tujuan = "setengah";
    if (rasio > 0.78) tujuan = "tutup";
    else if (rasio < 0.22) tujuan = "penuh";
    else if (rasio > 0.55) tujuan = "setengah";
    else tujuan = t.geser < t.awal ? "penuh" : "setengah";
    setGeser(null);
    setLaci(tujuan);
  };

  const bukaLaci = (v) => { setGeser(null); setLaci(v); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">RailView<i>pantau publik</i></div>
        <div className="crumbs"><b>JABODETABEK</b> / {status === "siap" ? "data langsung" : status === "memuat" ? "memuat…" : "gangguan"}</div>
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
        </div>
        <div className="stagefoot">
          <span><b>LIVE</b> {trains.length} kereta berjalan</span>
          <span>{total.tampil ? `${total.tampil} dari ${total.semua} kereta hari ini` : "—"}</span>
        </div>
      </main>

      {/* kartu ringkas kanan atas */}
      {ringkas && (
        <div className="ringkas">
          <button className="ringkas-x" onClick={() => setRingkas(false)} aria-label="sembunyikan ringkasan">×</button>
          <h4>Ringkas</h4>
          <div className="rbaris"><span className="rdot" style={{ background: WARNA_MODA.K }} />KRL<em>{jumlah("K")}</em></div>
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
          <button className={"lt" + (tab === "kereta" ? " on" : "")} onClick={() => setTab("kereta")}>
            Kereta <u>{trains.length}</u>
          </button>
          <button className={"lt" + (tab === "kamera" ? " on" : "")} onClick={() => setTab("kamera")}>
            Kamera <u>{daftarKamera.length}</u>
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
                    className={pesawat ? "hidup" : "mati"}
                    onClick={() => { const v = !pesawat; setPesawat(v); localStorage.setItem("rv-pesawat", v ? "1" : "0"); }}
                  ><i style={{ background: "#a9c8e8" }} />Pesawat live<b>{pesawat ? "on" : "off"}</b></span>
                  <span
                    className={rencana ? "hidup" : "mati"}
                    onClick={() => { const v = !rencana; setRencana(v); localStorage.setItem("rv-rencana", v ? "1" : "0"); }}
                  ><i style={{ background: "#c07be0" }} />Jalur rencana<b>{rencana ? "on" : "off"}</b></span>
                  <span className="hidup"><i style={{ background: "#8FA7C4" }} />Stasiun<b>{jumlahStasiun || 158}</b></span>
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

          {tab === "kereta" && (
            <div className="lgrid">
              <div className="kartu">
                <h5>Kereta berjalan · {trains.length}</h5>
                <div className="daftar">
                  {trains.slice(0, 40).map((t) => (
                    <div className="r" key={t[0]}>
                      <b>{t[1]}</b>
                      <span className="mda">{MODA[t[2]] || "KA"}</span>
                      <em>menuju {namaSt(t[6])}</em>
                    </div>
                  ))}
                  {trains.length === 0 && <div className="r"><em>menunggu data…</em></div>}
                </div>
              </div>

              <div className="kartu">
                <h5>{pilih ? "kereta dipilih" : "pilih kereta di peta"}</h5>
                {pilih ? (
                  <>
                    <div className="besar">{pilih.kode}<span>{MODA[pilih.moda] || "antarkota"}</span></div>
                    <div className="rows">
                      <div className="row"><span>Stasiun berikut</span><b>{namaSt(pilih.next)}</b></div>
                      <div className="row"><span>Arah</span><b>{pilih.arah}°</b></div>
                      <div className="row"><span>Kode</span><b>{pilih.id}</b></div>
                    </div>
                    {sisaJalur.length > 0 && (
                      <div className="sisa">
                        {sisaJalur.map((p) => (
                          <div className="sisa-r" key={p.st + p.lat}><s /><span>{p.nama}</span><em>{p.st}</em></div>
                        ))}
                      </div>
                    )}
                    <div className="acts">
                      <button className="btn primary" onClick={() => mapRef.current?.flyKe(pilih.lng, pilih.lat, 14)}>Ikuti kereta</button>
                      <button className="btn" onClick={() => mapRef.current?.map?.flyTo({ center: [106.86, -6.22], zoom: 9.2, pitch: 55 })}>Seluruh Jabodetabek</button>
                    </div>
                  </>
                ) : (
                  <p className="note">Klik titik kereta di peta, jalurnya akan tergambar dan detailnya muncul di sini.</p>
                )}
              </div>
            </div>
          )}

          {tab === "kamera" && (
            <div className="lgrid">
              <div className="kartu">
                <h5>{kamera?.judul || "memuat kamera…"}</h5>
                <div className="frame">
                  {kamera?.jenis === "iframe" || kamera?.jenis === "embed" ? (
                    <iframe key={kamera.nama} src={kamera.embed} title={kamera.judul} allow="autoplay; fullscreen" referrerPolicy="no-referrer" />
                  ) : kamera?.hanyaGambar ? (
                    <img className="snap" alt={kamera.judul} src={`${kamera.foto}?t=${Math.floor((Date.now() + detak * 10000) / 10000)}`} />
                  ) : (
                    <video ref={videoRef} poster={kamera?.foto} muted playsInline autoPlay />
                  )}
                  <div className="grain" />
                  <div className={kamera?.hanyaGambar ? "rec gambar" : "rec"}>
                    <u />{kamera?.hanyaGambar ? "GAMBAR 10 DETIK" : "LANGSUNG"}
                  </div>
                </div>
                <select
                  className="camselect"
                  value={kamera?.nama || ""}
                  onChange={(e) => setKamera(daftarKamera.find((k) => k.nama === e.target.value) || null)}
                >
                  {daftarKamera.map((k) => (
                    <option key={k.nama} value={k.nama}>{k.judul}{k.hidup === false ? " · offline" : ""}</option>
                  ))}
                </select>
              </div>

              <div className="kartu">
                <h5>Info kamera</h5>
                <div className="rows">
                  <div className="row"><span>Pengelola</span><b>Pemkot Bekasi / Bogor</b></div>
                  <div className="row"><span>Kamera</span><b>{kamera?.nama || "—"}</b></div>
                  <div className="row"><span>Format</span><b>{kamera?.jenis === "iframe" || kamera?.jenis === "embed" ? "embed" : kamera?.hanyaGambar ? "gambar" : "HLS"}</b></div>
                  <div className="row"><span>Status</span><b>{kamera?.hidup === false ? "offline" : kamera?.hanyaGambar ? "video dibatasi" : "siaran publik"}</b></div>
                  {kamera?.catatan ? <div className="row"><span>Catatan</span><b style={{ maxWidth: 190, textAlign: "right" }}>{kamera.catatan}</b></div> : null}
                </div>
                <div className="acts">
                  <button className="btn primary" onClick={() => kamera && window.open(kamera.foto, "_blank")}>Buka sumber</button>
                  <button className="btn" onClick={() => bukaLaci("tutup")}>Tutup laci</button>
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
