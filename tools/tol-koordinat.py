"""Beri koordinat kamera tol: tempelkan ke geometri jalan tol OSM memakai nomor KM.

- Ambil geometri motorway Jawa dari Overpass (cache docs/mockup/data/tol/osm-motorway.json)
- Cocokkan nama ruas (Bina Marga) ke nama jalan tol OSM
- Susun rantai ruas, hitung panjang, taruh kamera di posisi km-nya
Keluaran: netlify/functions/data/tol-kamera.mjs
"""
import json, math, os, re, time, unicodedata, urllib.parse, urllib.request
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.abspath(os.path.join(ROOT, "..", "docs", "mockup", "data", "tol"))
OUT = os.path.join(ROOT, "netlify", "functions", "data")
HDR = {"User-Agent": "RailView/0.9 (kamera tol)", "Accept": "application/json"}
EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
BBOX = (-8.95, 105.05, -5.60, 114.65)

BUANG = {"tol", "jalan", "ruas", "seksi", "akses", "dalam", "kota", "dan", "the"}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def tok(s):
    return [t for t in norm(s).split() if t not in BUANG and len(t) > 2]


def mirip(a, b):
    return SequenceMatcher(None, a, b).ratio()


def haversine(a, b):
    R = 6371000
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp = p2 - p1
    dl = math.radians(b[0] - a[0])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def overpass(q, timeout=300):
    for ep in EPS:
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers=HDR)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                j = json.loads(r.read())
            if j.get("elements"):
                return j
        except Exception as ex:
            print("  gagal", ep.split("/")[2], str(ex)[:60], flush=True)
            time.sleep(4)
    return {"elements": []}


def ambil_geom():
    path = os.path.join(DATA, "osm-motorway.json")
    if os.path.exists(path) and os.path.getsize(path) > 100000:
        print("cache geometri", os.path.getsize(path) // 1024, "KB", flush=True)
        return json.load(open(path, encoding="utf-8"))["elements"]
    b = ",".join(map(str, BBOX))
    q = f'''[out:json][timeout:300];
way["highway"~"^(motorway|trunk|motorway_link)$"]["name"]({b});
out geom;'''
    j = overpass(q)
    if j["elements"]:
        open(path, "w", encoding="utf-8").write(json.dumps(j, separators=(",", ":")))
        print("geometri", len(j["elements"]), "way", os.path.getsize(path) // 1024, "KB", flush=True)
    return j["elements"]


def rantai(seg):
    """gabungkan segmen jadi satu polyline terurut (greedy dari titik paling barat)."""
    segs = [list(s) for s in seg if len(s) >= 2]
    if not segs:
        return []
    segs.sort(key=lambda s: min(p[0] for p in s))
    awal = segs.pop(0)
    jalur = list(awal)
    while segs:
        ujung = jalur[-1]
        best, bi, flip = None, None, False
        for i, s in enumerate(segs):
            d1, d2 = haversine(ujung, s[0]), haversine(ujung, s[-1])
            if best is None or min(d1, d2) < best:
                best, bi, flip = min(d1, d2), i, d2 < d1
        if best is None or best > 15000:  # lompatan > 15 km: berhenti
            break
        s = segs.pop(bi)
        jalur += (s[::-1] if flip else s)
    return jalur


def posisi(jalur, km, total_km):
    if not jalur or total_km <= 0:
        return None
    target = max(0.0, min(1.0, km / total_km)) * sum(haversine(jalur[i], jalur[i + 1]) for i in range(len(jalur) - 1))
    jalan = 0.0
    for i in range(len(jalur) - 1):
        d = haversine(jalur[i], jalur[i + 1])
        if jalan + d >= target and d > 0:
            t = (target - jalan) / d
            a, b = jalur[i], jalur[i + 1]
            return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        jalan += d
    return jalur[-1]


KOTA_CACHE = os.path.join(DATA, "kota.json")


def kota_koord(nama):
    cache = {}
    if os.path.exists(KOTA_CACHE):
        cache = json.load(open(KOTA_CACHE, encoding="utf-8"))
    key = norm(nama)
    if key in cache:
        return tuple(cache[key]) if cache[key] else None
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": nama + ", Indonesia", "format": "json", "limit": 1, "countrycodes": "id"})
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RailView/0.9 (kamera tol)", "Accept": "application/json"})
        d = json.loads(urllib.request.urlopen(req, timeout=25).read())
        v = [float(d[0]["lon"]), float(d[0]["lat"])] if d else None
    except Exception:
        v = None
    cache[key] = v
    json.dump(cache, open(KOTA_CACHE, "w", encoding="utf-8"), ensure_ascii=False)
    time.sleep(1.1)
    return tuple(v) if v else None


def utama():
    src = os.path.join(DATA, "kamera-tol.json")
    if not os.path.exists(src):
        print("kamera-tol.json belum ada — jalankan tools/fetch-tol.py dulu")
        return
    ruas = json.load(open(src, encoding="utf-8"))
    geom = ambil_geom()
    print("ruas:", len(ruas), "| way tol:", len(geom), flush=True)

    indeks = []
    for w in geom:
        t = w.get("tags", {})
        nama = t.get("name") or t.get("ref") or ""
        g = [[p["lon"], p["lat"]] for p in (w.get("geometry") or [])]
        if nama and len(g) >= 2:
            indeks.append((nama, tok(nama), g))

    hasil = []
    tanpa = []
    for r in ruas:
        rt = tok(r["nama"])
        if not rt:
            continue
        cocok_way = []
        rset = set(rt)
        for nama, nt, g in indeks:
            if not nt:
                continue
            nset = set(nt)
            inter = rset & nset
            if not inter:
                continue
            skor = len(inter) / len(rset)
            if skor >= 0.5:
                cocok_way.append((skor, g))
        if not cocok_way:
            tanpa.append(r)
            continue
        jalur = rantai([g for _, g in cocok_way])
        total = sum(haversine(jalur[i], jalur[i + 1]) for i in range(len(jalur) - 1)) / 1000
        if total < 1:
            continue
        for i, k in enumerate(r["kamera"]):
            m = re.search(r"(\d{1,3})\+(\d{3})", k["label"])
            km = float(m.group(1)) + float(m.group(2)) / 1000 if m else (i + 1) / (len(r["kamera"]) + 1) * total
            p = posisi(jalur, km, total)
            if not p:
                continue
            hasil.append({
                "nama": f"tol-{r['id'][:10]}-{i:02d}",
                "judul": f"{r['nama']} · {k['label']}",
                "kota": "Tol",
                "jenis": "hls",
                "lng": round(p[0], 5), "lat": round(p[1], 5),
                "hls": k["url"], "perkiraan": True, "ruas": r["nama"], "cara": "km",
            })
        print(f"  {r['nama'][:40]:42s} {len(r['kamera']):3d} kamera | {total:6.1f} km", flush=True)

    # ── fallback: ruas tanpa geometri → garis kota-ke-kota, lalu ditempel ke tol terdekat ──
    if tanpa:
        print(f"\nfallback {len(tanpa)} ruas (kota → kota, lalu snap ke tol terdekat)", flush=True)
        semua_titik = [pt for _, _, g in indeks for pt in g]
        grid = {}
        for pt in semua_titik:
            grid.setdefault((round(pt[0] * 20), round(pt[1] * 20)), []).append(pt)
        def snap(lng, lat):
            k0 = (round(lng * 20), round(lat * 20))
            best, bp = None, None
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for pt in grid.get((k0[0] + dx, k0[1] + dy), []):
                        d = haversine((lng, lat), pt)
                        if best is None or d < best:
                            best, bp = d, pt
            return bp if best is not None and best < 6000 else None

        for r in tanpa:
            bagi = re.split(r"\s*[-–]\s*|\s+KE\s+", r["nama"])
            bagi = [x for x in bagi if len(x.strip()) > 3]
            if len(bagi) < 2:
                print(f"  {r['nama'][:40]:42s} nama tidak bisa dipecah", flush=True)
                continue
            a = kota_koord(bagi[0])
            b = kota_koord(bagi[-1])
            if not a or not b:
                print(f"  {r['nama'][:40]:42s} kota tidak ketemu", flush=True)
                continue
            total = haversine(a, b) / 1000
            for i, k in enumerate(r["kamera"]):
                m = re.search(r"(\d{1,3})\+(\d{3})", k["label"])
                frac = (float(m.group(1)) + float(m.group(2)) / 1000) / total if (m and total > 1) else (i + 1) / (len(r["kamera"]) + 1)
                frac = max(0.0, min(1.0, frac))
                lng = a[0] + (b[0] - a[0]) * frac
                lat = a[1] + (b[1] - a[1]) * frac
                sp = snap(lng, lat)
                if sp:
                    lng, lat = sp
                hasil.append({
                    "nama": f"tol-{r['id'][:10]}-{i:02d}",
                    "judul": f"{r['nama']} · {k['label']}",
                    "kota": "Tol", "jenis": "hls",
                    "lng": round(lng, 5), "lat": round(lat, 5),
                    "hls": k["url"], "perkiraan": True, "ruas": r["nama"], "cara": "kasar",
                })
            print(f"  {r['nama'][:40]:42s} {len(r['kamera']):3d} kamera (kasar)", flush=True)

    isi = "/* kamera tol (Bina Marga/Jasa Marga) + posisi km — dibuat tools/tol-koordinat.py */\n"
    isi += "export default " + json.dumps(hasil, ensure_ascii=False, indent=1) + ";\n"
    open(os.path.join(OUT, "tol-kamera.mjs"), "w", encoding="utf-8").write(isi)
    print(f"\nSELESAI: {len(hasil)} kamera tol berkoordinat")


if __name__ == "__main__":
    utama()
