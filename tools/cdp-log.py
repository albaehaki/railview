import json, time, subprocess, urllib.request, os, sys
import websocket

URL = sys.argv[1]
PORT = 9346
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-rv6")

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
ws.settimeout(2)
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
akhir = time.time() + 16
log = []
while time.time() < akhir:
    try:
        m = json.loads(ws.recv())
    except Exception:
        continue
    if m.get("method") == "Runtime.exceptionThrown":
        d = m["params"]["exceptionDetails"]
        log.append("EXC " + (d.get("exception", {}).get("description") or d.get("text", ""))[:400])
    elif m.get("method") == "Runtime.consoleAPICalled" and m["params"]["type"] in ("error", "warning"):
        args = " ".join(str(a.get("value", a.get("description", ""))) for a in m["params"]["args"])
        log.append(m["params"]["type"].upper() + " " + args[:300])
print("\n".join(log[:25]) or "tanpa galat")
ws.close(); proc.terminate()
