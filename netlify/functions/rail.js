import { ambilTrains, ambilStations, ambilDepots, ambilJalur, ambilJadwal } from "./_rail-core.js";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=0, s-maxage=20, stale-while-revalidate=10",
  "access-control-allow-origin": "*",
};

function balas(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

export default async (req) => {
  const url = new URL(req.url);
  const what = url.searchParams.get("what") || "trains";
  try {
    if (what === "trains") return balas(await ambilTrains());
    if (what === "stations") return balas(await ambilStations());
    if (what === "depots") return balas(await ambilDepots());
    if (what === "jadwal") {
      return balas(await ambilJadwal({
        nama: url.searchParams.get("nama"),
        lat: url.searchParams.get("lat"),
        lng: url.searchParams.get("lng"),
      }));
    }
    if (what === "jalur") return balas((await ambilJalur(url.searchParams.get("id"))) || { error: "tidak ada" }, 200);
    return balas({ error: "what tidak dikenal" }, 400);
  } catch (e) {
    return balas({ error: String(e) }, 502);
  }
};

export const config = { path: "/api/rail" };
