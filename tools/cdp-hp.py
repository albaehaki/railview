import json, time, subprocess, urllib.request, os, sys, base64
import websocket

URL = sys.argv[1]; OUT = sys.argv[2]
PORT = 9353
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-rv11")

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
def shot(path):
    d = cmd("Page.captureScreenshot", format="png", captureBeyondViewport=False)["result"]["data"]
    open(path, "wb").write(base64.b64decode(d))
    print("SIMPAN", path, os.path.getsize(path))

cmd("Page.enable"); cmd("Runtime.enable")
cmd("Emulation.setDeviceMetricsOverride", width=390, height=844, deviceScaleFactor=2, mobile=True)
cmd("Emulation.setTouchEmulationEnabled", enabled=True, maxTouchPoints=5)
cmd("Page.navigate", url=URL)
time.sleep(22)

print("awal:", ev("document.querySelector('.app').className"))
shot(OUT.replace(".png", "-1.png"))

ev("document.querySelector('.lipat-kiri').click()")
time.sleep(1)
print("kiri dibuka:", ev("document.querySelector('.app').className"))
print("tombolX:", ev("(()=>{const b=document.querySelector('.tutup-drawer');const r=b.getBoundingClientRect();return JSON.stringify({x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,tampil:getComputedStyle(b).display})})()"))
shot(OUT.replace(".png", "-2.png"))

ev("document.querySelector('.tutup-drawer').click()")
time.sleep(1)
print("kiri ditutup:", ev("document.querySelector('.app').className"))

ev("document.querySelector('.lipat-kanan').click()")
time.sleep(1)
print("kanan dibuka:", ev("document.querySelector('.app').className"))
shot(OUT.replace(".png", "-3.png"))
ev("document.querySelector('.tutup-panel').click()")
time.sleep(1)
print("kanan ditutup:", ev("document.querySelector('.app').className"))
ws.close(); proc.terminate()
