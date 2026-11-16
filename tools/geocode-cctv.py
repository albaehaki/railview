"""Isi koordinat 96 kamera CCTV yang belum punya titik.

Cocokkan nama kamera ke OSM: POI dulu (terminal/stasiun/RS/mal), lalu nama jalan.
Kamera pada jalan yang sama disebar ke ruas-ruas jalan itu (tidak menumpuk di satu titik).
Keluaran: netlify/functions/data/kamera-koordinat.mjs
"""
import json, os, re, time, unicodedata, urllib.parse, urllib.request
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.abspath(os.path.join(ROOT, "..", "docs", "mockup", "data", "jawa"))
OUT = os.path.join(ROOT, "netlify", "functions", "data")
HDR = {"User-Agent": "RailView/0.9 (geocode cctv)", "Accept": "application/json"}
EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

AREA = {
    "bekasi": (-6.50, 106.85, -6.05, 107.20, True),
    "jakarta": (-6.40, 106.62, -6.05, 107.00, False),
}

BUANG = {"jl", "jalan", "jend", "jenderal", "ir", "h", "kota", "kec", "kel", "raya",
         "timur", "barat", "utara", "selatan", "simpang", "perempatan", "pertigaan",
         "cctv", "live", "kamera", "satpol", "pp", "jkp", "jkb",
         "bekasi", "bogor", "jakarta", "depok", "tangerang", "cikarang", "bandung"}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower().replace(".", " ").replace(",", " ").replace("-", " ").replace("_", " ")
    return re.sub(r"\s+", " ", s).strip()


def tokens(s):
    return [t for t in norm(s).split() if t not in BUANG and len(t) > 2]


def mirip(a, b):
    return SequenceMatcher(None, a, b).ratio()


def cocok(poi_tok, kam_tok):
    pakai = set()
    for p in poi_tok:
        best, idx = 0.0, None
        for i, k in enumerate(kam_tok):
            if i in pakai:
                continue
            r = mirip(p, k)
            if r > best:
                best, idx = r, i
        if best < 0.83:
            return 0
        pakai.add(idx)
    return len(poi_tok)


def overpass(q, timeout=280):
    for ep in EPS:
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers=HDR)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                j = json.loads(r.read())
            if j.get("elements"):
                return j
            print("   kosong dari", ep.split("/")[2], flush=True)
        except Exception as ex:
            print("   gagal", ep.split("/")[2], str(ex)[:70], flush=True)
            time.sleep(5)
    return {"elements": []}


def nama_jalan_jakarta():
    """Ambil kata kunci jalan yang cukup spesifik, mis. 'Gatot Subroto' atau 'Parman'."""
    kam = json.load(open(os.path.join(DATA, "kamera-all.json"), encoding="utf-8"))
    pola = set()
    for k in kam:
        if not k["lat"] and (k.get("kota") or "").lower() == "jakarta":
            m = re.search(r"JL\.?\s*([A-Za-z\.\s]+?)\s+C\d", k["judul"] or "")
            if not m:
                continue
            kata = [t for t in m.group(1).split() if len(t) > 3 and "." not in t]
            if len(kata) >= 2:
                pola.add(" ".join(kata[-2:]))
            elif kata:
                pola.add(kata[-1])
    return sorted(pola)


def ambil_osm(area, bbox, poi):
    path = os.path.join(DATA, f"osm-{area}.json")
    if os.path.exists(path) and os.path.getsize(path) > 50000:
        print(area, "cache", os.path.getsize(path) // 1024, "KB", flush=True)
        return json.load(open(path, encoding="utf-8"))["elements"]
    b = ",".join(str(x) for x in bbox)
    if area == "jakarta":
        pola = "|".join(re.escape(x) for x in nama_jalan_jakarta())
        isi = f'way["highway"]["name"~"{pola}",i]({b});'
    else:
        isi = f'way["highway"]["name"]({b});'
    if poi:
        isi += f'''
  nwr["name"]["amenity"]({b});
  nwr["name"]["railway"]({b});
  nwr["name"]["shop"]({b});
  nwr["name"]["leisure"]({b});
  nwr["name"]["office"]({b});'''
    q = f"[out:json][timeout:280];\n(\n  {isi}\n);\nout center tags;"
    j = overpass(q)
    if not j["elements"]:
        print(area, "GAGAL (kosong), tidak di-cache", flush=True)
        return []
    open(path, "w", encoding="utf-8").write(json.dumps(j, separators=(",", ":")))
    print(area, "osm", len(j["elements"]), "elemen", os.path.getsize(path) // 1024, "KB", flush=True)
    return j["elements"]


def titik(e):
    if e["type"] == "node":
        return e.get("lat"), e.get("lon")
    c = e.get("center") or {}
    if "lat" in c:
        return c["lat"], c["lon"]
    return None, None


def utama():
    kam = json.load(open(os.path.join(DATA, "kamera-all.json"), encoding="utf-8"))
    tanpa = [k for k in kam if not k["lat"]]
    print("tanpa koordinat:", len(tanpa), flush=True)

    osm = {}
    for area, (s, w, n, e, poi) in AREA.items():
        osm[area] = ambil_osm(area, (s, w, n, e), poi)

    # indeks jalan per nama (untuk menyebar kamera di jalan yang sama)
    jalan = {}
    for area in osm:
        for el in osm[area]:
            t = el.get("tags", {})
            if t.get("highway") and t.get("name"):
                jalan.setdefault((area, t["name"]), []).append(titik(el))
    for k in jalan:
        jalan[k].sort(key=lambda p: (p[1] or 0))

    hasil, dipakai = {}, {}
    belum = []
    for k in tanpa:
        area = "jakarta" if (k.get("kota") or "").lower() == "jakarta" else "bekasi"
        kt = tokens(k["judul"] or k["nama"])
        best = None
        for el in osm[area]:
            t = el.get("tags", {})
            if t.get("place") or t.get("boundary") or t.get("admin_level"):
                continue  # node kota/kelurahan bukan landmark
            nama = t.get("name")
            if not nama:
                continue
            pt = tokens(nama)
            if not pt:
                continue
            n = cocok(pt, kt)
            if not n:
                continue
            la, lo = titik(el)
            if la is None:
                continue
            poin = 3 if (t.get("amenity") or t.get("railway")) else (2 if t.get("shop") or t.get("leisure") or t.get("office") else 1)
            if poin > 1 and n < 2 and len(pt) == 1 and len(pt[0]) < 7:
                continue  # satu kata pendek (mis. "Bekasi") terlalu longgar
            skor = (n / max(len(kt), 1)) * 10 + poin
            if not best or skor > best[0]:
                best = (skor, nama, la, lo, poin)
        if best:
            skor, nama, la, lo, poin = best
            if poin == 1:  # jalan → sebar ke ruas berbeda
                ruas = jalan.get((area, nama)) or [(la, lo)]
                i = dipakai.get((area, nama), 0)
                dipakai[(area, nama)] = i + 1
                la, lo = ruas[i % len(ruas)]
            hasil[k["nama"]] = {"lat": round(la, 5), "lng": round(lo, 5), "sumber": nama,
                                "perkiraan": poin == 1}
            print(f"  {k['nama'][:38]:40s} -> {nama[:32]:34s} {'JALAN' if poin==1 else 'POI'}  {la:.5f},{lo:.5f}", flush=True)
        else:
            belum.append(k["nama"])

    isi = "/* koordinat kamera hasil cocok OSM — dibuat tools/geocode-cctv.py */\n"
    isi += "export default " + json.dumps(hasil, ensure_ascii=False, indent=1) + ";\n"
    open(os.path.join(OUT, "kamera-koordinat.mjs"), "w", encoding="utf-8").write(isi)
    presisi = sum(1 for v in hasil.values() if not v["perkiraan"])
    print(f"\nHASIL {len(hasil)}/{len(tanpa)} · presisi {presisi} · perkiraan {len(hasil)-presisi}")
    print("belum dapat:", belum[:12])


if __name__ == "__main__":
    utama()
