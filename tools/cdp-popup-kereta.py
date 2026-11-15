import json, time, subprocess, urllib.request, sys
import websocket

URL = sys.argv[1]
OUT = sys.argv[2]
PORT = 9361

for p in subprocess.run(["powershell", "-NoProfile", "-Command",
                         "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*cdp-rv*' } | ForEach-Object { $_.ProcessId }"],
                        capture_output=True, text=True).stdout.split():
    subprocess.run(["powershell", "-NoProfile", "-Command", f"Stop-Process -Id {p} -Force"], capture_output=True)

subprocess.Popen([
    r"C:/Program Files/Google/Chrome/Application/chrome.exe", "--headless=new",
    f"--remote-debugging-port={PORT}", "--disable-gpu", "--enable-unsafe-swiftshader",
    "--hide-scrollbars", "--window-size=1440,900",
    "--user-data-dir=C:/Users/zacky/AppData/Local/Temp/cdp-rv-popup", "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ws_url = None
for _ in range(60):
    try:
        tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
        for t in tabs:
            if t.get("type") == "page":
                ws_url = t["webSocketDebuggerUrl"]; break
        if ws_url: break
    except Exception:
        time.sleep(0.5)
if not ws_url:
    raise SystemExit("chrome tidak siap")

ws = websocket.create_connection(ws_url, timeout=90)
n = 0
def cmd(method, **params):
    global n
    n += 1
    ws.send(json.dumps({"id": n, "method": method, "params": params}))
    while True:
        d = json.loads(ws.recv())
        if d.get("id") == n:
            return d

cmd("Page.enable")
cmd("Runtime.enable")
cmd("Page.navigate", url=URL)
time.sleep(26)

def ev(expr):
    r = cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
    return r.get("result", {}).get("result", {}).get("value")

pos = ev("""(() => {
  const m = window.__mapRef; if (!m) return null;
  const c0 = m.getCanvas();
  for (let y = 80; y < c0.height - 80; y += 24) {
    for (let x = 80; x < c0.width - 80; x += 24) {
      const f = m.queryRenderedFeatures([x, y], { layers: ["kereta-titik"] })[0];
      if (f) { const r = c0.getBoundingClientRect(); return [Math.round(r.left + x), Math.round(r.top + y), f.geometry.coordinates]; }
    }
  }
  const rv = window.__rv ? window.__rv() : [];
  if (!rv.length) return null;
  const c = m.getCanvas();
  const mid = [c.width / 2, c.height / 2];
  let best = null, bd = 1e9;
  for (const q of rv) {
    const s = m.project(q);
    const d = Math.hypot(s.x - mid[0], s.y - mid[1]);
    if (d < bd) { bd = d; best = q; }
  }
  const p = m.project(best);
  const r = m.getCanvas().getBoundingClientRect();
  return [Math.round(r.left + p.x), Math.round(r.top + p.y), best];
})()""")
print("POS", pos)

if pos:
    x, y = pos[0], pos[1]
    cmd("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
    cmd("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
    time.sleep(7)

print("POPUP", ev("(() => { const p = document.querySelector('.pop-kereta .pkr'); return p ? p.innerText.replace(/\\s+/g,' ').slice(0,300) : 'tidak ada'; })()"))
print("LACI", ev("(() => document.querySelector('.laci')?.className)()"))

shot = cmd("Page.captureScreenshot", format="png")
open(OUT, "wb").write(__import__("base64").b64decode(shot["result"]["data"]))
print("SIMPAN", OUT)
ws.close()
