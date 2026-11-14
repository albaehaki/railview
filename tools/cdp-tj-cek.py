import json, time, subprocess, urllib.request, os, sys, base64, math
import websocket

URL = sys.argv[1]
PORT = 9350
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-rv10")

proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader", f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}",
    "--hide-scrollbars", "--window-size=1440,900", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def targets():
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json") as r:
                return json.load(r)
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("chrome tidak siap")

t = [x for x in targets() if x.get("type") == "page"][0]
ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=120)
mid = 0
def cmd(method, **params):
    global mid
    mid += 1
    ws.send(json.dumps({"id": mid, "method": method, "params": params}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == mid:
            return m
def ev(expr):
    r = cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)["result"]["result"]
    return r.get("value") or r.get("description")

cmd("Page.enable"); cmd("Runtime.enable"); cmd("Page.navigate", url=URL)
time.sleep(30)

EXPR = """(async () => {
  const map = window.__mapRef; if (!map) return 'tanpa map';
  const ambil = () => Object.fromEntries(map.querySourceFeatures('tj').map(f => [f.properties.id, f.geometry.coordinates]));
  const a = ambil(); await new Promise(r => setTimeout(r, 1000));
  const b = ambil();
  let n = 0, diam = 0, maks = 0, jumlah = 0;
  for (const id in a) {
    if (!b[id]) continue;
    const d = Math.hypot((b[id][0]-a[id][0])*111320*Math.cos(a[id][1]*Math.PI/180), (b[id][1]-a[id][1])*110540);
    n++; jumlah += d; if (d < 0.05) diam++; maks = Math.max(maks, d);
  }
  return JSON.stringify({bus: n, diam, rerata_m_per_dtk: +(jumlah/n).toFixed(2), maks_m: +maks.toFixed(1)});
})()"""
print(ev(EXPR))
ws.close(); proc.terminate()
