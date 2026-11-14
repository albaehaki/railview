"""Bangun geometri rel dari OSM + rute antar stasiun untuk RailView.

Masukan : ov-full.json (Overpass: way railway + geometry)
Keluaran: netlify/functions/data/routes.json  (kunci "ST_A>ST_B" -> [[lat,lng],...])
          public/rel.geojson                  (garis rel untuk ditampilkan)
"""
import json, math, heapq, os, sys
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else r"D:/tmp/ov-full.json"
TRAINS = r"D:/projek/riset-cctv/tr.json"

def hav(a, b):
    R = 6371000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

d = json.load(open(SRC, encoding="utf-8"))
graph = defaultdict(list)
nodes = {}

for el in d["elements"]:
    if el.get("type") != "way":
        continue
    ids = el.get("nodes") or []
    geo = el.get("geometry") or []
    if len(ids) != len(geo):
        continue
    prev = None
    for nid, g in zip(ids, geo):
        if g is None:
            prev = None
            continue
        nodes[nid] = (g["lat"], g["lon"])
        if prev is not None:
            w = hav(nodes[prev], nodes[nid])
            graph[prev].append((nid, w))
            graph[nid].append((prev, w))
        prev = nid

print("node:", len(nodes), "| edge:", sum(len(v) for v in graph.values()) // 2)

# grid untuk cari node terdekat
CELL = 0.01
grid = defaultdict(list)
for nid, (lat, lng) in nodes.items():
    grid[(round(lat / CELL), round(lng / CELL))].append(nid)

def terdekat(lat, lng, radius=0.02):
    best, bd = None, 1e18
    ci, cj = round(lat / CELL), round(lng / CELL)
    r = int(radius / CELL) + 1
    for i in range(ci - r, ci + r + 1):
        for j in range(cj - r, cj + r + 1):
            for nid in grid.get((i, j), ()):
                dd = hav((lat, lng), nodes[nid])
                if dd < bd:
                    best, bd = nid, dd
    return best, bd

def a_star(a, b):
    if a is None or b is None:
        return None
    goal = nodes[b]
    openq = [(0.0, 0.0, a)]
    came = {a: None}
    gsc = {a: 0.0}
    while openq:
        _, g, cur = heapq.heappop(openq)
        if cur == b:
            path = []
            while cur is not None:
                path.append(nodes[cur])
                cur = came[cur]
            return path[::-1]
        for nxt, w in graph[cur]:
            ng = g + w
            if ng < gsc.get(nxt, 1e18):
                gsc[nxt] = ng
                came[nxt] = cur
                heapq.heappush(openq, (ng + hav(nodes[nxt], goal), ng, nxt))
    return None

def sederhana(pts, tol=12.0):
    if len(pts) < 3:
        return pts
    def dp(lo, hi, keep):
        if hi <= lo + 1:
            return
        a, b = pts[lo], pts[hi]
        dmax, idx = 0.0, lo
        for i in range(lo + 1, hi):
            p = pts[i]
            # jarak titik ke garis (aproksimasi planar)
            y2, x2 = b
            y1, x1 = a
            y0, x0 = p
            dx, dy = x2 - x1, y2 - y1
            if dx == 0 and dy == 0:
                dd = hav(p, a)
            else:
                t = max(0, min(1, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)))
                dd = hav(p, (y1 + t * dy, x1 + t * dx))
            if dd > dmax:
                dmax, idx = dd, i
        if dmax > tol:
            keep.add(idx)
            dp(lo, idx, keep)
            dp(idx, hi, keep)
    keep = {0, len(pts) - 1}
    dp(0, len(pts) - 1, keep)
    return [pts[i] for i in sorted(keep)]

# pasangan stasiun dari jadwal
tr = json.load(open(TRAINS, encoding="utf-8"))["data"]
pasangan = {}
for t in tr:
    ps = t.get("paths") or []
    for x, y in zip(ps, ps[1:]):
        if x.get("st_cd") and y.get("st_cd"):
            k = f'{x["st_cd"]}>{y["st_cd"]}'
            pasangan.setdefault(k, ((x["lat"], x["lng"]), (y["lat"], y["lng"])))
print("pasangan stasiun:", len(pasangan))

routes, gagal = {}, 0
for i, (k, (a, b)) in enumerate(pasangan.items(), 1):
    na, da = terdekat(*a)
    nb, db = terdekat(*b)
    if na is None or nb is None:      # station coords invalid (0,0)
        gagal += 1
        continue
    if da > 2500 and db > 2500:       # station not near any rail
        gagal += 1
        continue
    path = a_star(na, nb)
    if not path or len(path) < 2:
        gagal += 1
        continue
    path = sederhana(path, 12)
    routes[k] = [[round(la, 6), round(ln, 6)] for la, ln in path]

    if i % 100 == 0:
        print(f"  {i}/{len(pasangan)} rute...")

os.makedirs(os.path.join(BASE, "netlify/functions/data"), exist_ok=True)
os.makedirs(os.path.join(BASE, "public"), exist_ok=True)
out = os.path.join(BASE, "netlify/functions/data/routes.json")
json.dump(routes, open(out, "w", encoding="utf-8"), separators=(",", ":"))
print("routes:", len(routes), "gagal:", gagal, "| ukuran:", round(os.path.getsize(out) / 1e6, 2), "MB")

# garis rel untuk peta
feats = []
seen = set()
for nid, tetangga in graph.items():
    for m, _ in tetangga:
        key = (min(nid, m), max(nid, m))
        if key in seen:
            continue
        seen.add(key)
        feats.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [[nodes[nid][1], nodes[nid][0]], [nodes[m][1], nodes[m][0]]]},
            "properties": {},
        })
geo = os.path.join(BASE, "public/rel.geojson")
json.dump({"type": "FeatureCollection", "features": feats}, open(geo, "w", encoding="utf-8"), separators=(",", ":"))
print("rel fitur:", len(feats), "| ukuran:", round(os.path.getsize(geo) / 1e6, 2), "MB")
