import json, time, subprocess, urllib.request, os, sys
import websocket

URL = sys.argv[1]
PORT = 9343
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(os.environ.get("LOCALAPPDATA", r"C:\Users\zacky\AppData\Local"), "Temp", "cdp-railview3")

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

cmd("Page.enable"); cmd("Runtime.enable"); cmd("Page.navigate", url=URL)
time.sleep(14)
for i in range(3):
    r = cmd("Runtime.evaluate", expression="JSON.stringify(window.__diag ? window.__diag() : null)", returnByValue=True)
    print(time.strftime("%H:%M:%S"), r.get("result", {}).get("result", {}).get("value"))
    time.sleep(3)
ws.close(); proc.terminate()
