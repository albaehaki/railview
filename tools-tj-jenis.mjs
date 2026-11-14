import mqtt from "mqtt";

const jenis = new Map();
const rute = new Map();
const contoh = new Map();
const klien = mqtt.connect("wss://mqtt.tj.co.id:8084/mqtt", {
  clientId: "mqttjs_" + Math.random().toString(16).slice(2, 10),
  keepalive: 60, connectTimeout: 15000,
});
klien.on("connect", () => klien.subscribe("/mobile_armada/#", { qos: 0 }));
klien.on("message", (_t, buf) => {
  try {
    const d = JSON.parse(buf.toString());
    const t = d.type || "(kosong)";
    jenis.set(t, (jenis.get(t) || 0) + 1);
    if (!contoh.has(t)) contoh.set(t, { rute: d.route_code, nama: d.route_long_name, headsign: d.trip_headsign });
    if (d.route_code) rute.set(d.route_code, (rute.get(d.route_code) || 0) + 1);
  } catch {}
});
setTimeout(() => {
  console.log("JENIS:", JSON.stringify([...jenis].sort((a, b) => b[1] - a[1])));
  console.log("CONTOH:", JSON.stringify([...contoh]));
  const jak = [...rute].filter(([k]) => /^JAK/i.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log("RUTE JAK:", JSON.stringify(jak));
  klien.end(true);
  process.exit(0);
}, 25000);
