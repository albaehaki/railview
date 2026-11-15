import json, os, hashlib, urllib.request, mimetypes, sys

SITE = "f014c623-d4f7-45c5-8cd2-de1ff7b45073"
DIST = r"D:/projek/railview/app/dist"
CFG = os.path.expandvars(r"%APPDATA%\netlify\Config\config.json")
tok = json.load(open(CFG, encoding="utf-8"))["users"]["63ec4372d88f4b4b9c2ac5b1"]["auth"]["token"]
H = {"authorization": f"Bearer {tok}"}


def files_map():
    out = {}
    for root, _, fs in os.walk(DIST):
        for f in fs:
            p = os.path.join(root, f)
            rel = "/" + os.path.relpath(p, DIST).replace("\\", "/")
            out[rel] = hashlib.sha1(open(p, "rb").read()).hexdigest()
    return out


def req(url, data=None, method=None, ctype="application/json"):
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(url, data=body, headers={**H, "content-type": ctype}, method=method or ("POST" if body else "GET"))
    return json.load(urllib.request.urlopen(r, timeout=120))


fm = files_map()
print("berkas", len(fm))
dep = req(f"https://api.netlify.com/api/v1/sites/{SITE}/deploys", {"files": fm})
print("deploy", dep["id"], "state", dep.get("state"))
butuh = dep.get("required") or []
print("perlu unggah", len(butuh))
for rel in butuh:
    p = os.path.join(DIST, rel.lstrip("/").replace("/", os.sep))
    data = open(p, "rb").read()
    ct = mimetypes.guess_type(p)[0] or "application/octet-stream"
    r = urllib.request.Request(
        f"https://api.netlify.com/api/v1/deploys/{dep['id']}/files{rel}",
        data=data, method="PUT", headers={**H, "content-type": ct})
    urllib.request.urlopen(r, timeout=180)
    print("  naik", rel, len(data))

print("selesai, url:", dep.get("ssl_url"))
