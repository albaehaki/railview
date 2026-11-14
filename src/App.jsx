import { useEffect, useRef, useState } from "react";
import { createScene } from "./scene/createScene.js";

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
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function acak() {
  const hue = Math.floor(Math.random() * 360);
  return {
    low: hsl(hue, 14, 14),
    mid: hsl(hue, 15, 19),
    high: hsl(hue, 16, 24),
  };
}

const TICKER = [
  { t: "14:22", n: "KRL 1732", r: "Bekasi → Jakarta Kota", st: "TEPAT" },
  { t: "14:21", n: "KA 118", r: "Gambir → Surabaya Pasar Turi", st: "LEWAT" },
  { t: "14:19", n: "KRL 1740", r: "Manggarai → Bekasi", st: "+2 MNT", late: true },
  { t: "14:17", n: "KLB 71", r: "Cikampek → Tanjung Priok", st: "TEPAT" },
];

export default function App() {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRef = useRef(null);
  const sceneApi = useRef(null);

  const [jam, setJam] = useState("--:--:--");
  const [tab, setTab] = useState("kamera");
  const [warna, setWarna] = useState({ low: "#252d20", mid: "#2f3728", high: "#3a4432" });
  const [preset, setPreset] = useState("hijau");
  const [wilayah, setWilayah] = useState("Semua");

  useEffect(() => {
    sceneApi.current = createScene(canvasRef.current, stageRef.current, labelRef.current);
    return () => sceneApi.current?.dispose();
  }, []);

  useEffect(() => {
    sceneApi.current?.setBuildingColors(warna);
  }, [warna]);

  useEffect(() => {
    const p = new URLSearchParams(location.search).get("preset");
    const found = PRESETS.find((x) => x.id === p);
    if (found) {
      setWarna({ low: found.low, mid: found.mid, high: found.high });
      setPreset(found.id);
    }
  }, []);

  useEffect(() => {
    sceneApi.current?.setTrainSelected(tab === "kereta");
  }, [tab]);

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

  const ubah = (key, val) => {
    setWarna((w) => ({ ...w, [key]: val }));
    setPreset(null);
  };

  const pakaiPreset = (p) => {
    setWarna({ low: p.low, mid: p.mid, high: p.high });
    setPreset(p.id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">RailView<i>pantau publik</i></div>
        <div className="crumbs"><b>JABODETABEK</b> / lapisan: kereta, kamera, stasiun</div>
        <div className="meta">
          <span><b>2.387</b> kereta</span>
          <span><b>266</b> kamera</span>
          <span><b>85</b> stasiun</span>
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
          <div className="layer t on"><span className="sw" />Kereta antarkota<span className="n">1.204</span></div>
          <div className="layer b on"><span className="sw" />Kereta barang<span className="n">318</span></div>
          <div className="layer k on"><span className="sw" />KRL Jabodetabek<span className="n">865</span></div>
          <div className="layer c on"><span className="sw" />Kamera CCTV<span className="n">266</span></div>
        </div>

        <div>
          <div className="label">Jalan</div>
          <div className="layer r on"><span className="sw" />Tol layang<span className="n">4 lajur</span></div>
          <div className="layer a on"><span className="sw" />Arteri<span className="n">2 lajur</span></div>
          <div className="layer a on"><span className="sw" />Gang<span className="n">1 mobil</span></div>
          <div className="layer g on"><span className="sw" />JPO<span className="n">1</span></div>
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
              <button
                key={p.id}
                className={"preset" + (preset === p.id ? " on" : "")}
                onClick={() => pakaiPreset(p)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button className="acak" onClick={() => { setWarna(acak()); setPreset(null); }}>
            Acak warna
          </button>
        </div>

        <div>
          <div className="label">Wilayah</div>
          <div className="filters">
            {["Semua", "Jakarta", "Bekasi", "Bogor", "Tangerang"].map((w) => (
              <button key={w} className={"chip" + (wilayah === w ? " on" : "")} onClick={() => setWilayah(w)}>
                {w}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="label">Keterangan</div>
          <div className="legend">
            <span><i style={{ background: "#E6ECE1" }} />kereta penumpang</span>
            <span><i style={{ background: "#D9A24B" }} />kereta barang</span>
            <span><i style={{ background: "#58A874" }} />kamera siaran</span>
            <span><i style={{ background: "#5D685C" }} />kamera mati</span>
            <span><i style={{ background: "#7B8A6E", height: 4 }} />jalan layang</span>
            <span><i style={{ background: "#5E6C55" }} />jalan arteri</span>
            <span><i style={{ background: "#B9A98A", height: 1 }} />gang / setapak</span>
          </div>
        </div>

        <div className="note">
          Posisi kereta dari jadwal GAPEKA dan laporan petugas. Kamera disematkan dari portal
          pemerintah daerah, tidak direkam. Data pada mockup ini contoh.
        </div>
      </aside>

      <main className="stage" ref={stageRef}>
        <canvas id="scene" ref={canvasRef} />
        <div className="vignette" />
        <div className="labels" ref={labelRef} />
        <div className="stagefoot"><span><b>MOCKUP</b> data contoh</span><span>skala 1:24.000</span></div>
        <div className="hint">geser untuk memutar · klik kamera</div>
        <div className="mapchrome">
          <div className="scale"><span>0</span><i /><span>500 m</span></div>
          <div className="comp"><b>N</b><i /></div>
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

            <div className="near">
              <div className="label">Kamera lain di sekitar</div>
              <a href="#">Cut Mutia · Rawa Semut <i>1,1 km</i></a>
              <a href="#">Terminal Kota Bekasi <i>2,4 km</i></a>
              <a href="#">Jl Ir H Juanda · KFC <i>3,0 km</i></a>
            </div>
          </div>
        ) : (
          <div className="pane">
            <div className="phead">
              <div className="eyebrow">kereta · krl jabodetabek <em>berjalan</em></div>
              <h1>KRL 1732<br />Bekasi → Jakarta Kota</h1>
              <div className="sub">8 gerbong · rangkaian JR205 · 68 km/j</div>
            </div>

            <div className="route">
              <div className="rline"><i /></div>
              <div className="rstops">
                <div className="rst done"><s /><b>Bekasi</b><em>14:22</em></div>
                <div className="rst now"><s /><b>Jatinegara</b><em>14:31</em></div>
                <div className="rst"><s /><b>Manggarai</b><em>14:39</em></div>
                <div className="rst"><s /><b>Tanah Abang</b><em>14:51</em></div>
                <div className="rst"><s /><b>Jakarta Kota</b><em>15:04</em></div>
              </div>
            </div>

            <div className="rows">
              <div className="row"><span>Posisi</span><b>1,2 km sebelum Jatinegara</b></div>
              <div className="row"><span>Kecepatan</span><b>68 km/j</b></div>
              <div className="row"><span>Okupansi</span><b>padat · 85%</b></div>
              <div className="row"><span>Ketepatan</span><b className="ok">tepat waktu</b></div>
              <div className="row"><span>Rangkaian</span><b>JR205 · 8 gerbong</b></div>
            </div>

            <div className="acts">
              <button className="btn primary">Ikuti kereta</button>
              <button className="btn">Kamera di stasiun</button>
            </div>

            <div className="near">
              <div className="label">Kereta lain di jalur ini</div>
              <a href="#">KRL 1740 · arah berlawanan <i>2,4 km</i></a>
              <a href="#">KA 118 · lewat jalur 2 <i>6 mnt</i></a>
              <a href="#">KLB 71 · barang <i>11 mnt</i></a>
            </div>
          </div>
        )}
      </aside>

      <footer className="ticker">
        <div className="thead"><span>pergerakan terakhir</span><span>·</span><span>contoh</span></div>
        <div className="trows">
          {TICKER.map((x) => (
            <div className="trow" key={x.n}>
              <span className="t">{x.t}</span>
              <span className="n">{x.n}</span>
              <span className="r">{x.r}</span>
              <span className={"st" + (x.late ? " late" : "")}>{x.st}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
