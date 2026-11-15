const SUMBER = "https://api.adsb.lol/v2/point/-6.20/106.80/150";

const balas = (body, status = 200, maxAge = 20) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    },
  });

export default async () => {
  try {
    const r = await fetch(SUMBER, {
      headers: { "user-agent": "RailView/0.4 (pantau publik)" },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return balas({ pesawat: [], galat: `sumber ${r.status}` }, 200, 10);
    const d = await r.json();
    const pesawat = (d.ac || [])
      .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lon))
      .filter((a) => a.lat > -6.95 && a.lat < -5.70 && a.lon > 106.15 && a.lon < 107.55)
      .map((a) => ({
        id: a.hex,
        callsign: (a.flight || "").trim() || a.hex,
        negara: a.r || "",
        lng: +a.lon.toFixed(5),
        lat: +a.lat.toFixed(5),
        alt: typeof a.alt_baro === "number" ? Math.round(a.alt_baro * 0.3048) : 0,
        cepat: Math.round((a.gs || 0) * 1.852),
        arah: Math.round(a.track || 0),
        naik: a.baro_rate || 0,
        jenis: a.t || "",
      }));
    return balas({ pesawat, waktu: d.now }, 200, 20);
  } catch (e) {
    return balas({ pesawat: [], galat: String(e).slice(0, 120) }, 200, 10);
  }
};

export const config = { path: "/api/pesawat" };
