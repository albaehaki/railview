import json, time, subprocess, urllib.request, os, sys, base64, math
import websocket

URL = sys.argv[1]; OUT = sys.argv[2]
PORT = 9349
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-rv9")

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
    return cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)["result"]["result"].get("value")

cmd("Page.enable"); cmd("Runtime.enable"); cmd("Page.navigate", url=URL)
time.sleep(30)
# ambil satu bus, lacak 12 sampel tiap 250 ms
EXPR = """(async () => {
  const map = window.__mapRef;
  if (!map) return JSON.stringify({err:'tanpa map'});
  const pilih = (f) => f.properties.id;
  let f0 = map.querySourceFeatures('tj')[0];
  if (!f0) return JSON.stringify({err:'tanpa bus'});
  const id = pilih(f0);
  const jejak = [];
  for (let i = 0; i < 12; i++) {
    const f = map.querySourceFeatures('tj').find(x => x.properties.id === id);
    if (f) jejak.push(f.geometry.coordinates);
    await new Promise(r => setTimeout(r, 250));
  }
  let maks = 0, total = 0;
  for (let i = 1; i < jejak.length; i++) {
    const [x1,y1] = jejak[i-1], [x2,y2] = jejak[i];
    const d = Math.hypot((x2-x1)*111320*Math.cos(y1*Math.PI/180), (y2-y1)*110540);
    maks = Math.max(maks, d); total += d;
  }
  return JSON.stringify({id, sampel: jejak.length, langkahMaks_m: +maks.toFixed(1), total_m: +total.toFixed(1)});
})()"""
print(ev(EXPR))
shot = cmd("Page.captureScreenshot", format="png")["result"]["data"]
open(OUT, "wb").write(base64.b64decode(shot))
print("SIMPAN", OUT, os.path.getsize(OUT))
ws.close(); proc.terminate()
