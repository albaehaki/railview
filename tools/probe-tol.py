"""Periksa kamera tol: playlist ada, segmen terakhir masih bisa diambil.
Keluaran: netlify/functions/data/tol-status.mjs  (nama -> {hidup, umur, catatan})
Jalankan: python tools/probe-tol.py
"""
import json, os, re, ssl, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "netlify", "functions", "data")
UA = {"User-Agent": "Mozilla/5.0 (RailView probe tol)", "Origin": "https://railview-app.netlify.app"}
CTX = ssl.create_default_context()

def ambil(url, timeout=15):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=timeout, context=CTX)

def periksa(k):
    nama, url = k["nama"], k["hls"]
    try:
        r = ambil(url)
        teks = r.read().decode("utf-8", "ignore")
        if "#EXTM3U" not in teks:
            return nama, {"hidup": False, "catatan": "playlist tidak sah"}
        seg = [l.strip() for l in teks.splitlines() if l.strip() and not l.startswith("#")]
        if not seg:
            return nama, {"hidup": False, "catatan": "playlist kosong"}
        # segmen terakhir harus bisa diambil
        from urllib.parse import urljoin
        s = urljoin(url, seg[-1])
        r2 = ambil(s, timeout=15)
        b = r2.read(4096)
        if not b:
            return nama, {"hidup": False, "catatan": "segmen kosong"}
        if b[:1] == b"\x47":  # 0x47 = awal paket MPEG-TS
            return nama, {"hidup": True, "catatan": "siaran aktif"}
        return nama, {"hidup": True, "catatan": "segmen terbaca"}
    except Exception as e:
        pesan = str(e)[:40]
        return nama, {"hidup": False, "catatan": f"gagal: {pesan}"}

def utama():
    teks = open(os.path.join(DATA, "tol-kamera.mjs"), encoding="utf-8").read()
    kam = json.loads(teks[teks.index("["): teks.rindex("]") + 1])
    kam = [k for k in kam if k.get("cara") == "km"]
    print("memeriksa", len(kam), "kamera tol", flush=True)
    hasil = {}
    with ThreadPoolExecutor(max_workers=16) as ex:
        for i, (nama, st) in enumerate(ex.map(periksa, kam), 1):
            hasil[nama] = st
            if i % 50 == 0:
                print(" ", i, "selesai", flush=True)
    hidup = sum(1 for v in hasil.values() if v["hidup"])
    print(f"HASIL: {hidup}/{len(hasil)} hidup")
    from collections import Counter
    for c, n in Counter(v["catatan"].split(":")[0] for v in hasil.values()).most_common(5):
        print("  ", c, n)
    isi = "/* status kamera tol — dibuat tools/probe-tol.py */\nexport default " + json.dumps(hasil, ensure_ascii=False) + ";\n"
    open(os.path.join(DATA, "tol-status.mjs"), "w", encoding="utf-8").write(isi)
    print("tulis tol-status.mjs", os.path.getsize(os.path.join(DATA, "tol-status.mjs")), "byte")

if __name__ == "__main__":
    utama()
