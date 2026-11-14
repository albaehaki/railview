import mqtt from "mqtt";

/** Langganan posisi bus TransJakarta (broker publik, tanpa akun). */
export function sambungTJ(onJumlah) {
  const bus = new Map();
  const klien = mqtt.connect("wss://mqtt.tj.co.id:8084/mqtt", {
    keepalive: 60,
    reconnectPeriod: 5000,
    connectTimeout: 15000,
    clientId: "mqttjs_" + Math.random().toString(16).slice(2, 10),
  });

  const dbg = { konek: false, pesan: 0, err: null };
  if (typeof window !== "undefined") window.__tjDebug = dbg;

  klien.on("connect", () => { dbg.konek = true; klien.subscribe("/mobile_armada/#", { qos: 0 }); });
  klien.on("close", () => { dbg.konek = false; });
  klien.on("error", (e) => { dbg.err = e?.message || String(e); console.warn("TJ:", dbg.err); });

  klien.on("message", (_topik, buf) => {
    try {
      dbg.pesan++;
      const d = JSON.parse(buf.toString());
      if (!d.latitude || !d.longitude) return;
      const id = d.bus_body_no || _topik;
      bus.set(id, {
        lat: d.latitude,
        lng: d.longitude,
        arah: d.bearing ?? 0,
        rute: d.route_code || "",
        nama: d.route_long_name || d.trip_headsign || "",
        tipe: d.type || "",
        ts: d.timestamp || Date.now(),
      });
    } catch {
      /* abaikan pesan rusak */
    }
  });

  const jam = setInterval(() => {
    const feats = [];
    for (const [id, b] of bus) {
      if (Date.now() - b.ts > 5 * 60000) continue; // bus mati > 5 menit
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [b.lng, b.lat] },
        properties: { id, rute: b.rute, nama: b.nama, tipe: b.tipe, arah: b.arah },
      });
    }
    onJumlah?.(feats);
  }, 1500);

  return {
    berhenti() {
      clearInterval(jam);
      klien.end(true);
    },
  };
}
