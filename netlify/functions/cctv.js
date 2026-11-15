import KAMERA from "./data/kamera.mjs";
import STATUS from "./data/status.mjs";
import KAMERA_JKT from "./data/kamera-jkt.mjs";

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
  const SEMUA = [...KAMERA, ...KAMERA_JKT];
  const hasil = await Promise.all(
    SEMUA.map(async (k) => {
      const tanda = STATUS[k.nama];
      if (typeof tanda === "boolean" && tanda === false) {
        return { ...k, hidup: false, catatan: "siaran sedang mati" };
      }
      if (k.jenis === "hls") return { ...k, hidup: true, hanyaGambar: true, catatan: "video asal memblokir server · tampil gambar terbaru" };
      if (typeof tanda === "boolean" && tanda) return { ...k, hidup: true, catatan: "" };
      try {
        const r = await fetch(`${BASE}/api/cctv/stream/${encodeURIComponent(k.nama)}.m3u8`, { headers: UA, signal: AbortSignal.timeout(6000) });
        const t = await r.text();
        const seg = t.split("\n").find((l) => l.trim().endsWith(".ts"));
        const m = seg && seg.match(/(\d{10})_/);
        const umur = m ? Date.now() - Number(m[1]) * 1000 : 1e9;
        return { ...k, hidup: umur < 30 * 60000 };
      } catch {
        return { ...k, hidup: false, catatan: "video dibatasi origin · tampil gambar terbaru" };
      }
    })
  );
  const nilai = (k) => Number(!!k.hidup && !k.hanyaGambar) * 2 + Number(!!k.hidup);
  hasil.sort((a, b) => nilai(b) - nilai(a));
  cacheList = { at: Date.now(), data: hasil };
  return hasil;
}

export default async (req) => {
  const u = new URL(req.url);
  const what = u.searchParams.get("what") || "list";

  if (what === "peta") {
    const titik = KAMERA.filter((k) => k.lat && k.lng).map((k) => ({ nama: k.nama, judul: k.judul, lat: k.lat, lng: k.lng, jenis: k.jenis }));
    return new Response(JSON.stringify({ jumlah: titik.length, kamera: titik }), {
      headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "public, max-age=600" },
    });
  }

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
    const r = await fetch(`${BASE}/api/cctv/seg/${encodeURIComponent(f)}`, { headers: UA, redirect: "follow" });
    if (!r.ok) {
      const cuplik = (await r.text().catch(() => "")).slice(0, 120);
      return new Response(JSON.stringify({ galat: "segmen", status: r.status, url: r.url, cuplik }),
        { status: 502, headers: { ...HEAD, "content-type": "application/json" } });
    }
    return new Response(r.body, {
      headers: { "content-type": "video/mp2t", "access-control-allow-origin": "*", "cache-control": "public, max-age=20" },
    });
  }

  return new Response("what tidak dikenal", { status: 400, headers: HEAD });
};

export const config = { path: "/api/cctv" };
