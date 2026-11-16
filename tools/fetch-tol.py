"""Ambil daftar CCTV tol resmi Bina Marga (PUPR) beserta URL HLS.
Sumber: https://binamarga.pu.go.id/contents/cctv_tol  (per ruas)
Keluaran: docs/mockup/data/tol/kamera-tol.json
Jalankan: python tools/fetch-tol.py
"""
import json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.abspath(os.path.join(ROOT, "..", "docs", "mockup", "data", "tol"))
os.makedirs(OUT, exist_ok=True)
BASE = "https://binamarga.pu.go.id/contents/cctv_tol"
HDR = {"User-Agent": "Mozilla/5.0 (RailView 0.9)", "Accept-Language": "id"}


def get(url, timeout=40):
    req = urllib.request.Request(url, headers=HDR)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def utama():
    idx = get(BASE)
    ruas = sorted(set(re.findall(r"cctv_tol/\?id_ruas=([\w\-]+)", idx)))
    print("ruas:", len(ruas), flush=True)

    hasil = []
    for i, rid in enumerate(ruas, 1):
        try:
            h = get(f"{BASE}/?id_ruas={rid}")
        except Exception as ex:
            print(f"  [{i}/{len(ruas)}] {rid} GAGAL {str(ex)[:50]}", flush=True)
            continue
        judul = [re.sub(r"<[^>]+>", "", x).strip() for x in re.findall(r"<h[23][^>]*>(.*?)</h[23]>", h, re.S)]
        judul = [x for x in judul if x and "CCTV Jalan Tol" not in x]
        nama = judul[-1] if judul else rid.replace("-", " ").title()

        # pasangkan tiap <source m3u8> dengan <h5> label berikutnya (ada blok <script> di antaranya)
        src = [(m.start(), m.group(1)) for m in re.finditer(r'<source\s+src="(https://[^"]+\.m3u8)"', h)]
        lab = [(m.start(), re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip())
               for m in re.finditer(r"<h5[^>]*>(.*?)</h5>", h, re.S)]
        kam = []
        for pos, url in src:
            nextlab = next(((p, t) for p, t in lab if p > pos), None)
            kam.append({"label": nextlab[1] if nextlab else "kamera", "url": url})
        uniq, seen = [], set()
        for k in kam:
            if k["url"] in seen:
                continue
            seen.add(k["url"])
            uniq.append(k)
        hasil.append({"id": rid, "nama": nama, "kamera": uniq})
        print(f"  [{i}/{len(ruas)}] {rid:42s} {len(uniq):3d} kamera  {nama[:40]}", flush=True)
        time.sleep(0.6)

    path = os.path.join(OUT, "kamera-tol.json")
    json.dump(hasil, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    total = sum(len(r["kamera"]) for r in hasil)
    print(f"\nSELESAI: {len(hasil)} ruas, {total} kamera -> {path}")


if __name__ == "__main__":
    utama()
