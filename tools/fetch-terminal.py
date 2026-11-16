import json, os, time, urllib.parse, urllib.request

D = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "docs", "mockup", "data", "jawa"))
HDR = {"User-Agent": "RailView/0.7 (peta jawa)", "Accept": "application/json"}
EPS = ["https://overpass-api.de/api/interpreter",
       "https://overpass.kumi.systems/api/interpreter",
       "https://overpass.private.coffee/api/interpreter"]

Q = {
    "tm-node": '''[out:json][timeout:90];
node["amenity"="bus_station"](-8.95,105.05,-5.60,114.65);
out tags;''',
    "tm-way": '''[out:json][timeout:150];
way["amenity"="bus_station"](-8.95,105.05,-5.60,114.65);
out center tags;''',
}

for nama, q in Q.items():
    path = os.path.join(D, nama + ".json")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print(nama, "ada", flush=True); continue
    ok = False
    for ep in EPS:
        try:
            t = time.time()
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers=HDR)
            with urllib.request.urlopen(req, timeout=180) as r:
                b = r.read()
            j = json.loads(b)
            open(path, "wb").write(b)
            print(nama, len(j["elements"]), "elemen", len(b) // 1024, "KB", round(time.time() - t, 1), "s", flush=True)
            ok = True
            break
        except Exception as ex:
            print(nama, "gagal", ep.split("/")[2], str(ex)[:80], flush=True)
            time.sleep(4)
    if not ok:
        print(nama, "GAGAL SEMUA", flush=True)
