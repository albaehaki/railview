"""Ambil data OSM se-Jawa untuk RailView (rel, stasiun, bandara, terminal, halte).
Jalankan: python tools/fetch-jawa.py   (aman diulang; file yang sudah ada dilewati)
"""
import json, os, sys, time, urllib.parse, urllib.request

D = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "docs", "mockup", "data", "jawa")
D = os.path.abspath(D)
os.makedirs(D, exist_ok=True)
BBOX = "-8.95,105.05,-5.60,114.65"
HDR = {"User-Agent": "RailView/0.7 (peta jawa)", "Accept": "application/json"}
EPS = ["https://overpass-api.de/api/interpreter",
       "https://overpass.kumi.systems/api/interpreter",
       "https://overpass.private.coffee/api/interpreter"]

QUERIES = {
    "rel": f'''[out:json][timeout:300];
way["railway"~"^(rail|light_rail|subway|narrow_gauge)$"]({BBOX});
out geom;''',
    "stasiun": f'''[out:json][timeout:300];
(
  node["railway"~"^(station|halt)$"]({BBOX});
  way["railway"~"^(station|halt)$"]({BBOX});
);
out center tags;''',
    "bandara": f'''[out:json][timeout:300];
(
  node["aeroway"="aerodrome"]({BBOX});
  way["aeroway"="aerodrome"]({BBOX});
);
out center tags;''',
    "terminal": f'''[out:json][timeout:300];
(
  node["amenity"="bus_station"]({BBOX});
  way["amenity"="bus_station"]({BBOX});
);
out center tags;''',
    "halte": f'''[out:json][timeout:300];
node["highway"="bus_stop"]({BBOX});
out tags;''',
}


def ambil(nama, q, timeout=280):
    path = os.path.join(D, nama + ".json")
    if os.path.exists(path) and os.path.getsize(path) > 2000:
        print(nama, "sudah ada", os.path.getsize(path) // 1024, "KB", flush=True)
        return True
    for ep in EPS:
        try:
            t = time.time()
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers=HDR)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
            j = json.loads(b)
            open(path, "wb").write(b)
            print(f"{nama}: {len(j.get('elements', []))} elemen, {len(b)//1024} KB, {round(time.time()-t,1)}s", flush=True)
            return True
        except Exception as ex:
            print(f"  {nama} gagal di {ep.split('/')[2]}: {str(ex)[:90]}", flush=True)
            time.sleep(6)
    return False


gagal = []
for nama, q in QUERIES.items():
    if not ambil(nama, q):
        gagal.append(nama)
print("SELESAI. gagal:", gagal or "tidak ada", flush=True)
