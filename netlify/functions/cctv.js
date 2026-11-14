import KAMERA from "./data/kamera.mjs";

const BASE = "https://bekasikota.go.id";
const UA = { "User-Agent": "Mozilla/5.0 (RailView)", Referer: BASE + "/" };

const HEAD = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};


let cacheList = { at: 0, data: null };

/** kamera dianggap hidup kalau segmen di playlistnya masih baru (< 30 menit) */
async function cekHidup() {
  if (cacheList.data && Date.now() - cacheList.at < 5 * 60000) return cacheList.data;
  const hasil = await Promise.all(
    KAMERA.map(async (k) => {
      if (k.jenis !== "hls") return { ...k, hidup: true };
      try {
        const r = await fetch(`${BASE}/api/cctv/stream/${encodeURIComponent(k.nama)}.m3u8`, { headers: UA, signal: AbortSignal.timeout(6000) });
        const t = await r.text();
        const seg = t.split("\n").find((l) => l.trim().endsWith(".ts"));
        const m = seg && seg.match(/(\d{10})_/);
        const umur = m ? Date.now() - Number(m[1]) * 1000 : 1e9;
        return { ...k, hidup: umur < 30 * 60000 };
      } catch {
        return { ...k, hidup: false };
      }
    })
  );
  hasil.sort((a, b) => Number(b.hidup) - Number(a.hidup));
  cacheList = { at: Date.now(), data: hasil };
  return hasil;
}

export default async (req) => {
  const u = new URL(req.url);
  const what = u.searchParams.get("what") || "list";

  if (what === "list") {
    const daftar = await cekHidup();
    return new Response(JSON.stringify({ jumlah: daftar.length, kamera: daftar }), {
      headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=120" },
    });
  }

  const nama = u.searchParams.get("n") || KAMERA[0].nama;

  if (what === "cek") {
    const r = await fetch(`${BASE}/api/cctv/stream/${encodeURIComponent(nama)}.m3u8`, { headers: UA });
    return new Response(JSON.stringify({ status: r.status, ct: r.headers.get("content-type"), awal: (await r.text()).slice(0, 160) }), {
      headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
    });
  }

  if (what === "m3u8") {
    const r = await fetch(`${BASE}/api/cctv/stream/${encodeURIComponent(nama)}.m3u8`, { headers: UA });
    if (!r.ok) return new Response("stream tidak tersedia", { status: 502, headers: HEAD });
    const teks = await r.text();
    /* segmen relatif -> lewat proxy kita */
    const isi = teks
      .split("\n")
      .map((b) => {
        const t = b.trim();
        if (!t || t.startsWith("#")) return b;
        const file = t.split("/").pop();
        return `/api/cctv?what=seg&n=${encodeURIComponent(nama)}&f=${encodeURIComponent(file)}`;
      })
      .join("\n");
    return new Response(isi, {
      headers: { "content-type": "application/vnd.apple.mpegurl", "access-control-allow-origin": "*", "cache-control": "no-store" },
    });
  }

  if (what === "seg") {
    const f = u.searchParams.get("f") || "";
    if (!/^[\w.\-]+\.ts$/.test(f)) return new Response("nama segmen tidak sah", { status: 400, headers: HEAD });
    const r = await fetch(`${BASE}/api/cctv/seg/${encodeURIComponent(f)}`, { headers: UA });
    if (!r.ok) return new Response("segmen tidak ada", { status: 502, headers: HEAD });
    return new Response(r.body, {
      headers: { "content-type": "video/mp2t", "access-control-allow-origin": "*", "cache-control": "public, max-age=20" },
    });
  }

  return new Response("what tidak dikenal", { status: 400, headers: HEAD });
};

export const config = { path: "/api/cctv" };
