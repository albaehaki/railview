import json, time, subprocess, urllib.request, os, sys
import websocket

URL = sys.argv[1] if len(sys.argv) > 1 else "https://railview-app.netlify.app/?z=11.9&lat=-6.2&lng=106.85&laci=setengah&x=tarik"
PORT = 9356
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-rv6")

proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader", f"--remote-debugging-port={PORT}", f"--user-data-dir={PROFILE}",
    "--hide-scrollbars", "--window-size=1440,900", "about:blank"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def targets():
    for _ in range(40):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json") as r:
                return json.load(r)
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("chrome tidak siap")

t = [x for x in targets() if x.get("type") == "page"][0]
ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=90)
mid = 0
def cmd(method, **params):
    global mid
    mid += 1
    ws.send(json.dumps({"id": mid, "method": method, "params": params}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == mid:
            return m

cmd("Page.enable"); cmd("Runtime.enable"); cmd("Page.navigate", url=URL)
time.sleep(15)

def ev(expr):
    r = cmd("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
    return r.get("result", {}).get("result", {}).get("value")

pos = json.loads(ev("(()=>{const r=document.querySelector('.pegang').getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)})})()"))
sebelum = ev("document.querySelector('.laci').className")

def mouse(kind, x, y, btn="left"):
    cmd("Input.dispatchMouseEvent", type=kind, x=x, y=y, button=btn,
        buttons=1 if kind != "mouseReleased" else 0, clickCount=1)

mouse("mousePressed", pos["x"], pos["y"])
for d in range(20, 320, 20):
    mouse("mouseMoved", pos["x"], pos["y"] + d)
    time.sleep(0.02)
mouse("mouseReleased", pos["x"], pos["y"] + 320)
time.sleep(1.2)

sesudah = ev("document.querySelector('.laci').className")
tr = ev("getComputedStyle(document.querySelector('.laci')).transform")
print(json.dumps({"sebelum": sebelum, "sesudah": sesudah, "transform": tr}, ensure_ascii=False))
ws.close(); proc.terminate()
