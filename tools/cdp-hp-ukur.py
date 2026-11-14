import json, time, subprocess, urllib.request, os, sys, base64
import websocket

URL = sys.argv[1]
PORT = 9354
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-rv12")

proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader", f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}",
    "--hide-scrollbars", "--window-size=430,932", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

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
    return r.get("value")

cmd("Page.enable"); cmd("Runtime.enable")
cmd("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
cmd("Page.navigate", url=URL)
time.sleep(20)

EXPR = """JSON.stringify({
  vw: window.innerWidth, vh: window.innerHeight,
  docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
  bodyW: document.body.scrollWidth,
  app: (() => { const r = document.querySelector('.app').getBoundingClientRect(); return [r.x|0, r.y|0, r.width|0, r.height|0]; })(),
  stage: (() => { const r = document.querySelector('.stage').getBoundingClientRect(); return [r.x|0, r.y|0, r.width|0, r.height|0]; })(),
  kanvas: (() => { const c = document.querySelector('#map canvas'); const r = c.getBoundingClientRect(); return [r.width|0, r.height|0, c.width, c.height]; })(),
  rail: (() => { const r = document.querySelector('.rail').getBoundingClientRect(); return [r.x|0, r.width|0]; })(),
  panel: (() => { const e = document.querySelector('.panel'); const r = e.getBoundingClientRect(); return [r.x|0, r.width|0, getComputedStyle(e).transform]; })(),
  kelas: document.querySelector('.app').className,
  ticker: (() => { const r = document.querySelector('.ticker').getBoundingClientRect(); return [r.y|0, r.height|0]; })(),
  mq: matchMedia('(max-width: 900px)').matches
})"""
print(ev(EXPR))
ws.close(); proc.terminate()
