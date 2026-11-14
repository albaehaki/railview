import json, time, base64, subprocess, urllib.request, os, sys
import websocket

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5184/"
OUT = sys.argv[2] if len(sys.argv) > 2 else r"D:/projek/railview/docs/mockup/cdp.png"
WAIT = float(sys.argv[3]) if len(sys.argv) > 3 else 12.0
PORT = 9339
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-railview")

proc = subprocess.Popen([
    CHROME, "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
    f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}", "--hide-scrollbars",
    "--window-size=1440,900", "--no-first-run", "--no-default-browser-check", "about:blank",
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def targets():
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json") as r:
                return json.load(r)
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("chrome tidak siap")

t = [x for x in targets() if x.get("type") == "page"][0]
ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=60)
mid = 0
def cmd(method, **params):
    global mid
    mid += 1
    ws.send(json.dumps({"id": mid, "method": method, "params": params}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == mid:
            return msg

cmd("Page.enable")
cmd("Runtime.enable")
cmd("Page.navigate", url=URL)
time.sleep(WAIT)

expr = """(() => {
  const el = document.querySelector('canvas.maplibregl-canvas');
  const diag = window.__diag ? window.__diag() : null;
  return JSON.stringify({diag, canvas: el ? [el.width, el.height] : null, title: document.title});
})()"""
r = cmd("Runtime.evaluate", expression=expr, returnByValue=True)
print("EVAL:", r.get("result", {}).get("result", {}).get("value"))

shot = cmd("Page.captureScreenshot", format="png")
data = shot.get("result", {}).get("data")
if data:
    open(OUT, "wb").write(base64.b64decode(data))
    print("SIMPAN", OUT, os.path.getsize(OUT))

ws.close()
proc.terminate()
