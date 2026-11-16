"""Ubah dump OSM se-Jawa (docs/mockup/data/jawa/*.json) jadi GeoJSON ringkas di public/.
- rel: LineString disederhanakan (Douglas-Peucker 0,0002° ≈ 22 m)
- titik: node atau center way, properti nama/iata/jenis saja
Jalankan: python tools/convert-jawa.py
"""
import json, os, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(os.path.join(ROOT, "..", "docs", "mockup", "data", "jawa"))
OUT = os.path.join(ROOT, "public")


def dp(pts, tol):
    """Douglas-Peucker sederhana untuk [lng, lat]."""
    if len(pts) < 3:
        return pts
    def d(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == 0 and dy == 0:
            return math.hypot(x - x1, y - y1)
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        dd = d(pts[i], pts[0], pts[-1])
        if dd > dmax:
            dmax, idx = dd, i
    if dmax > tol:
        return dp(pts[:idx + 1], tol)[:-1] + dp(pts[idx:], tol)
    return [pts[0], pts[-1]]


def baca(nama):
    p = os.path.join(SRC, nama + ".json")
    if not os.path.exists(p):
        print(nama, "tidak ada, dilewati")
        return []
    return json.load(open(p, encoding="utf-8")).get("elements", [])


def titik(e):
    if e["type"] == "node":
        return [e["lon"], e["lat"]]
    c = e.get("center") or {}
    if "lon" in c:
        return [c["lon"], c["lat"]]
    return None


def tulis(nama, fc):
    p = os.path.join(OUT, nama + ".geojson")
    json.dump(fc, open(p, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    print(f"{nama}: {len(fc['features'])} fitur, {os.path.getsize(p)//1024} KB")


# ── rel ──
feats = []
for e in baca("rel"):
    g = e.get("geometry")
    if not g or len(g) < 2:
        continue
    pts = [[round(p["lon"], 5), round(p["lat"], 5)] for p in g]
    pts = dp(pts, 0.0002)
    if len(pts) < 2:
        continue
    t = e.get("tags", {})
    feats.append({
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": pts},
        "properties": {
            "kelas": t.get("railway", "rail"),
            **({"nama": t["name"]} if "name" in t else {}),
            **({"guna": t["usage"]} if "usage" in t else {}),
        },
    })
tulis("jawa-rel", {"type": "FeatureCollection", "features": feats})

# ── stasiun ──
feats = []
for e in baca("stasiun"):
    c = titik(e)
    if not c:
        continue
    t = e.get("tags", {})
    feats.append({
        "type": "Feature", "geometry": {"type": "Point", "coordinates": [round(c[0], 5), round(c[1], 5)]},
        "properties": {
            "nama": t.get("name") or "stasiun tanpa nama",
            "jenis": t.get("railway", "station"),
            **({"kode": t["ref"]} if "ref" in t else {}),
        },
    })
tulis("jawa-stasiun", {"type": "FeatureCollection", "features": feats})

# ── bandara ──
feats = []
for e in baca("bandara"):
    c = titik(e)
    if not c:
        continue
    t = e.get("tags", {})
    feats.append({
        "type": "Feature", "geometry": {"type": "Point", "coordinates": [round(c[0], 5), round(c[1], 5)]},
        "properties": {
            "nama": t.get("name") or "bandara",
            **({"iata": t["iata"]} if "iata" in t else {}),
            **({"icao": t["icao"]} if "icao" in t else {}),
            **({"jenis": t.get("aerodrome:type") or t.get("type")} if (t.get("aerodrome:type") or t.get("type")) else {}),
        },
    })
tulis("jawa-bandara", {"type": "FeatureCollection", "features": feats})

# ── terminal bus (way + node dipisah karena query digabung sering 502) ──
feats = []
for nama in ("terminal", "tm-way", "tm-node"):
    for e in baca(nama):
        c = titik(e)
        if not c:
            continue
        t = e.get("tags", {})
        feats.append({
            "type": "Feature", "geometry": {"type": "Point", "coordinates": [round(c[0], 5), round(c[1], 5)]},
            "properties": {"nama": t.get("name") or "terminal bus"},
        })
tulis("jawa-terminal", {"type": "FeatureCollection", "features": feats})

# ── halte bus ──
feats = []
for e in baca("halte"):
    if e["type"] != "node":
        continue
    t = e.get("tags", {})
    feats.append({
        "type": "Feature", "geometry": {"type": "Point", "coordinates": [round(e["lon"], 5), round(e["lat"], 5)]},
        "properties": {"nama": t.get("name") or t.get("ref") or "halte"},
    })
tulis("jawa-halte", {"type": "FeatureCollection", "features": feats})
