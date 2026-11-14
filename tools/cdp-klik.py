import json, time, subprocess, urllib.request, os, sys
import websocket

URL = sys.argv[1]
PORT = 9347
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-rv7")

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
    r = cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
    return r["result"]["result"].get("value")

cmd("Page.enable"); cmd("Runtime.enable"); cmd("Page.navigate", url=URL)
time.sleep(18)
info = json.loads(ev("JSON.stringify(window.__rvInfo())"))
print("SEBELUM", info["tengah"], "layar", info["kameraLayar"] or info["layar"])
if info.get("layar"):
    x, y, _ = info["kameraLayar"] or info["layar"]
    cmd("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y)
    cmd("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1)
    cmd("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1)
    time.sleep(3)
    after = json.loads(ev("JSON.stringify({t:window.__rvInfo().tengah, tab:(document.querySelector('.ptab.on')||{}).innerText, judul:(document.querySelector('.phead h1')||{}).innerText})"))
    print("SESUDAH", after)
ws.close(); proc.terminate()
