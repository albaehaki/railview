import mqtt from "mqtt";
const c = mqtt.connect("wss://mqtt.tj.co.id:8084/mqtt", { connectTimeout: 15000, reconnectPeriod: 0 });
let n = 0, contoh = null;
c.on("connect", () => { console.log("tersambung"); c.subscribe("/mobile_armada/#", { qos: 0 }); });
c.on("message", (t, m) => { n++; if (!contoh) { contoh = { topic: t, body: m.toString().slice(0, 700) }; } });
c.on("error", (e) => console.log("ERR", e.message));
setTimeout(() => {
  console.log("pesan:", n);
  console.log(JSON.stringify(contoh, null, 1));
  c.end(true); process.exit(0);
}, 12000);
