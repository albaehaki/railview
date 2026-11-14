import { createServer } from "node:http";
import { ambilTrains, ambilStations, ambilDepots, ambilJalur } from "../netlify/functions/_rail-core.js";

const PORT = 8898;

createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const what = u.searchParams.get("what") || "trains";
  try {
    let data;
    if (what === "trains") data = await ambilTrains();
    else if (what === "stations") data = await ambilStations();
    else if (what === "depots") data = await ambilDepots();
    else if (what === "jalur") data = await ambilJalur(u.searchParams.get("id"));
    else data = { error: "what tidak dikenal" };
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e) }));
  }
}).listen(PORT, () => console.log("dev-api di", PORT));
