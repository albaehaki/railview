/* Logika bersama: ambil data 168railway, hitung posisi kereta sekarang. */

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

/** posisi kereta pada detik ini, dari paths + jadwal */
export function posisiSekarang(train, nowMs) {
  const paths = train.paths || [];
  if (paths.length < 2) return null;
  const stops = paths.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    arr: p.arriv_ms,
    dep: p.depart_ms,
    st: p.st_cd,
  }));
  let prev = null;
  for (let i = 0; i < stops.length; i++) {
    stops[i].arr = bump(stops[i].arr, prev);
    stops[i].dep = bump(stops[i].dep, prev ?? stops[i].arr);
    prev = stops[i].dep ?? stops[i].arr ?? prev;
  }
  const mulai = stops[0].dep ?? stops[0].arr;
  const akhir = stops[stops.length - 1].arr ?? stops[stops.length - 1].dep;
  if (mulai == null || akhir == null) return null;
  if (nowMs < mulai - 10 * 60000 || nowMs > akhir + 10 * 60000) return null;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    const t0 = a.dep ?? a.arr;
    const t1 = b.arr ?? b.dep;
    if (t0 == null || t1 == null || t1 <= t0) continue;
    if (nowMs >= t0 && nowMs <= t1) {
      const f = (nowMs - t0) / (t1 - t0);
      const lat = a.lat + (b.lat - a.lat) * f;
      const lng = a.lng + (b.lng - a.lng) * f;
      const bearing = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
      return { lat, lng, bearing, next: b.st, f, dari: a.st };
    }
  }
  /* sebelum berangkat / setelah tiba: tempel di ujung */
  if (nowMs < mulai) {
    const a = stops[0];
    const b = stops[1];
    return { lat: a.lat, lng: a.lng, bearing: (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI, next: a.st, f: 0, dari: a.st };
  }
  const z = stops[stops.length - 1];
  const y = stops[stops.length - 2];
  return { lat: z.lat, lng: z.lng, bearing: (Math.atan2(z.lng - y.lng, z.lat - y.lat) * 180) / Math.PI, next: z.st, f: 1, dari: z.st };
}

const TIPE = { passenger: 0, freight: 1, commuter: 2, krl: 2 };

export async function ambilTrains() {
  const d = await getJson("/simulation/trains-region");
  const nowMs = nowMsWib();
  const out = [];
  for (const t of d.data || []) {
    const p = posisiSekarang(t, nowMs);
    if (!p) continue;
    out.push([
      t.tr_id,
      t.tr_cd,
      TIPE[t.tr_type] ?? 0,
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
  return {
    id: t.tr_id,
    kode: t.tr_cd,
    nama: t.tr_name,
    tipe: t.tr_type,
    relasi: t.relation,
    jalur: (t.paths || []).map((p) => ({
      st: p.st_cd,
      nama: p.st_name,
      lat: p.lat,
      lng: p.lng,
      arr: p.arriv_ms,
      dep: p.depart_ms,
    })),
  };
}
