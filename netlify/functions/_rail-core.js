/* Logika bersama: ambil data 168railway, hitung posisi kereta sekarang. */

import RUTE from "./data/routes.mjs";

const BASE = "https://168railway.com/api/web";
const UA = { "User-Agent": "RailView/0.2 (pantau publik; kontak: zackyalbaehaki@gmail.com)" };

const cache = new Map();
const TTL = 25000;

async function getJson(path) {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && now - hit.at < TTL) return hit.data;
  const res = await fetch(BASE + path, { headers: UA });
  if (!res.ok) throw new Error(`upstream ${res.status} ${path}`);
  const data = await res.json();
  cache.set(path, { at: now, data });
  return data;
}

function nowMsWib() {
  const d = new Date();
  return ((d.getUTCHours() + 7) % 24) * 3600000 + d.getUTCMinutes() * 60000 + d.getUTCSeconds() * 1000;
}

function bump(ms, prev) {
  if (ms == null) return null;
  let v = ms;
  while (prev != null && v < prev) v += 86400000;
  return v;
}


function jarakM(a, b) {
  const R = 6371000;
  const p1 = (a[0] * Math.PI) / 180, p2 = (b[0] * Math.PI) / 180;
  const dp = p2 - p1, dl = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** titik pada polyline sejauh f (0..1) dari total panjang */
function titikDiRute(pts, f) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = jarakM(pts[i - 1], pts[i]);
    seg.push(d);
    total += d;
  }
  if (total === 0) return pts[0];
  let sisa = total * Math.min(1, Math.max(0, f));
  for (let i = 0; i < seg.length; i++) {
    if (sisa <= seg[i]) {
      const t = seg[i] === 0 ? 0 : sisa / seg[i];
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
      ];
    }
    sisa -= seg[i];
  }
  return pts[pts.length - 1];
}

/** posisi kereta pada detik ini, dari paths + jadwal */
export function posisiSekarang(train, nowMs) {
  const paths = train.paths || [];
  if (paths.length < 2) return null;
  const DAY = 86400000;

  /* rapikan urutan waktu (kereta lewat tengah malam) */
  let prev = null;
  const stops = paths.map((p) => {
    const o = { lat: p.lat, lng: p.lng, arr: p.arriv_ms, dep: p.depart_ms, st: p.st_cd };
    if (o.arr != null) { while (prev != null && o.arr < prev) o.arr += DAY; prev = o.arr; }
    if (o.dep != null) { while (prev != null && o.dep < prev) o.dep += DAY; prev = o.dep; }
    return o;
  });

  const mulai = stops.find((s) => s.dep != null || s.arr != null);
  const akhirS = [...stops].reverse().find((s) => s.arr != null || s.dep != null);
  if (!mulai || !akhirS) return null;
  const t0All = mulai.dep ?? mulai.arr;
  const t1All = akhirS.arr ?? akhirS.dep;
  if (t1All == null || t0All == null || t1All <= t0All) return null;
  if (nowMs < t0All || nowMs > t1All) return null;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const ta = a.dep ?? a.arr;
    const tb = b.arr ?? b.dep;
    if (ta == null || tb == null || tb <= ta) continue;
    if (nowMs < ta || nowMs > tb) continue;

    /* jarak antar titik: kalau > 30 km, data jalur terpotong — jangan diinterpolasi */
    const dy = (b.lat - a.lat) * 110.574;
    const dx = (b.lng - a.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
    if (Math.hypot(dx, dy) > 30) return null;

    const f = (nowMs - ta) / (tb - ta);
    const rute = RUTE[`${a.st}>${b.st}`];
    let lat, lng;
    if (rute && rute.length > 1) {
      [lat, lng] = titikDiRute(rute, f);
    } else {
      lat = a.lat + (b.lat - a.lat) * f;
      lng = a.lng + (b.lng - a.lng) * f;
    }
    return {
      lat, lng, f,
      bearing: (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI,
      dari: a.st, next: b.st,
    };
  }
  return null;
}

/* kode moda: K=KRL, M=MRT, L=LRT Jabodebek, J=LRT Jakarta, W=Whoosh, A=antarkota, B=barang */
function moda(t) {
  const nama = String(t.tr_name || "").toUpperCase();
  const tipe = String(t.tr_type || "").toLowerCase();
  if (tipe === "whoosh") return "W";
  if (tipe === "freight" || tipe === "kirim_rangkaian") return "B";
  if (nama.includes("MRT")) return "M";
  if (nama.includes("LRTJ")) return "J";
  if (nama.includes("LRT")) return "L";
  if (tipe === "intercity" || tipe === "local") return "A";
  return "K";
}

export async function ambilTrains() {
  const d = await getJson("/simulation/trains-region");
  const nowMs = nowMsWib();
  const out = [];
  for (const t of d.data || []) {
    const p = posisiSekarang(t, nowMs);
    if (!p) continue;
    /* hanya yang benar-benar di dalam Jabodetabek */
    if (p.lat < -6.75 || p.lat > -5.85 || p.lng < 106.2 || p.lng > 107.4) continue;
    out.push([
      t.tr_id,
      t.tr_cd,
      moda(t),
      Math.round(p.lat * 1e5) / 1e5,
      Math.round(p.lng * 1e5) / 1e5,
      Math.round(p.bearing),
      p.next || "",
    ]);
  }
  return {
    generated_at: new Date().toISOString(),
    tier: d.tier,
    total_tampil: d.total_trains,
    total_semua: d.total_trains_all,
    jumlah: out.length,
    trains: out,
  };
}

export async function ambilStations() {
  const d = await getJson("/pk/stations");
  const arr = d.stations || d.data || [];
  return {
    jumlah: arr.length,
    stations: arr.map((s) => [
      s.st_cd || s.code,
      s.st_name || s.name,
      Number(s.lat),
      Number(s.lng),
      s.free ? 1 : 0,
    ]),
  };
}

export async function ambilDepots() {
  const d = await getJson("/depots");
  const arr = d.depots || d.data || [];
  return {
    jumlah: arr.length,
    depots: arr.map((s) => [s.name || s.depot_name, Number(s.lat), Number(s.lng)]),
  };
}

export async function ambilJalur(id) {
  const d = await getJson("/simulation/trains-region");
  const t = (d.data || []).find((x) => String(x.tr_id) === String(id));
  if (!t) return null;
  const jalur = (t.paths || []).map((p) => ({
    st: p.st_cd,
    nama: p.st_name,
    lat: p.lat,
    lng: p.lng,
    arr: p.arriv_ms,
    dep: p.depart_ms,
  }));

  /* garis mengikuti rel asli, bukan garis lurus antar stasiun */
  const garis = [];
  for (let i = 0; i < jalur.length - 1; i++) {
    const a = jalur[i], b = jalur[i + 1];
    const r = RUTE[`${a.st}>${b.st}`];
    if (r) for (const [la, ln] of r) garis.push({ lat: la, lng: ln });
    else {
      garis.push({ lat: a.lat, lng: a.lng });
      garis.push({ lat: b.lat, lng: b.lng });
    }
  }

  return { id: t.tr_id, kode: t.tr_cd, nama: t.tr_name, tipe: t.tr_type, relasi: t.relation, jalur, garis };
}

/* ---------- jadwal keberangkatan per stasiun (GAPEKA) ---------- */
const rapikan = (x) => String(x || "").toLowerCase()
  .replace(/^stasiun\s+/, "").replace(/\bstation\b/g, "").replace(/[^a-z0-9]/g, "");

const jamWib = (ms) => {
  const t = Math.round((ms % 86400000) / 60000);
  return String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
};

export async function ambilJadwal({ nama, lat, lng }) {
  const d = await getJson("/simulation/trains-region");
  const nowMs = nowMsWib();
  const la = lat ? Number(lat) : null, ln = lng ? Number(lng) : null;
  const cari = rapikan(nama);

  let titik = null, jarak = Infinity;
  for (const t of d.data || []) {
    for (const p of t.paths || []) {
      if (p.lat == null || p.lng == null) continue;
      if (la != null && ln != null) {
        const dm = jarakM([la, ln], [Number(p.lat), Number(p.lng)]);
        if (dm < jarak) { jarak = dm; titik = p; }
      } else if (cari && rapikan(p.st_name) === cari) { titik = p; }
    }
  }
  if (!titik) return { error: "stasiun tidak ditemukan di data jadwal" };
  if (la != null && jarak > 700) return { error: "stasiun terdekat di jadwal terlalu jauh", jarak_m: Math.round(jarak) };

  const kode = titik.st_cd;
  const namaSt = new Map();
  for (const t of d.data || []) for (const p of t.paths || []) if (p.st_cd && p.st_name) namaSt.set(p.st_cd, p.st_name);
  const keluar = [];
  for (const t of d.data || []) {
    const ps = t.paths || [];
    const i = ps.findIndex((p) => p.st_cd === kode);
    if (i < 0) continue;
    const p = ps[i];
    const dep = p.depart_ms ?? p.arriv_ms;
    if (dep == null) continue;
    let e = dep;
    while (e < nowMs - 120000) e += 86400000;      /* jadwal lewat tengah malam */
    if (e > nowMs + 6 * 3600000) continue;          /* hanya 6 jam ke depan */
    const ujung = ps[ps.length - 1];
    const tujuan = namaSt.get(t.end_st_cd) || ujung?.st_name || t.end_st_cd || "";
    keluar.push([t.tr_cd || String(t.tr_id), t.tr_name || "", tujuan, jamWib(dep), t.tr_type || "", Math.round((e - nowMs) / 60000)]);
  }
  keluar.sort((a, b) => a[5] - b[5]);
  return {
    stasiun: { kode, nama: titik.st_name, jarak_m: la != null ? Math.round(jarak) : 0 },
    sekarang: jamWib(nowMs),
    sumber: "jadwal GAPEKA (168railway)",
    jumlah: keluar.length,
    jadwal: keluar.slice(0, 12).map((x) => x.slice(0, 5)),
    menit: keluar.slice(0, 12).map((x) => x[5]),
  };
}
