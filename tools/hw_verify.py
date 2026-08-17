#!/usr/bin/env python3
"""VectiSuite on-hardware verification, run against a real device over the LAN.

Everything the serial console cannot reach: the HTTP endpoints actually serving,
the WebSocket dashboard exchanging frames, an OTA upload really flashing, and the
captive-portal probe URLs that make a phone pop the setup page.

    python3 tools/hw_verify.py --host 192.168.4.1

Written to run in one shot with no dependencies beyond the stdlib, because it is
executed while this machine is joined to the device's own access point and has no
internet to install anything from.

(c) 2026 VectiVolt — Apache-2.0 License
"""
import argparse, base64, hashlib, json, os, socket, ssl, struct, sys, time
import urllib.request, urllib.error

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
results = []


def check(name, fn):
    t0 = time.time()
    try:
        ok, detail = fn()
    except Exception as e:                     # a dead socket is a result, not a crash
        ok, detail = False, f"{type(e).__name__}: {e}"
    ms = int((time.time() - t0) * 1000)
    results.append((PASS if ok else FAIL, name, detail, ms))
    print(f"  [{PASS if ok else FAIL}] {name} ({ms} ms) — {detail}")
    return ok


def http(host, path, timeout=8, method="GET", data=None, headers=None):
    req = urllib.request.Request(f"http://{host}{path}", data=data, method=method,
                                 headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read(), dict(r.headers)


# ---- individual checks -----------------------------------------------------

def t_dash_redirect(host):
    """`/` should 302 to /dash — the workaround for a truncated response on `/`."""
    req = urllib.request.Request(f"http://{host}/")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k): return None
    op = urllib.request.build_opener(NoRedirect)
    try:
        op.open(req, timeout=8)
        return False, "expected a redirect, got 200"
    except urllib.error.HTTPError as e:
        loc = e.headers.get("Location", "")
        return e.code == 302 and loc == "/dash", f"{e.code} -> {loc!r}"


def t_page(host, path, needle=b"<!doctype html", gz_expected=True):
    def run():
        st, body, hdr = http(host, path)
        enc = hdr.get("Content-Encoding", "")
        # urllib does not auto-inflate, so a gzip body starts with the magic.
        gz = body[:2] == b"\x1f\x8b"
        if gz:
            import gzip
            body = gzip.decompress(body)
        ok = st == 200 and needle in body.lower()
        return ok, f"{st}, {len(body)} B inflated, Content-Encoding={enc!r}, gzip={gz}"
    return run


def t_ota_info(host):
    st, body, _ = http(host, "/ota/info")
    j = json.loads(body)
    need = {"hwId", "fwVersion", "freeHeap", "currentSlot", "nextSlot", "slotState",
            "updating", "allowFw", "allowFs", "allowPull"}
    missing = need - set(j)
    return (st == 200 and not missing), f"{st}, keys ok" if not missing else f"missing {missing}"


def t_wifi_status(host):
    st, body, _ = http(host, "/wifi/status")
    j = json.loads(body)
    return st == 200 and "state" in j, f"{st}, state={j.get('state')}, ssid={j.get('ssid')!r}"


def t_captive(host):
    """The probe URLs an OS hits to decide whether it is behind a captive portal."""
    paths = ["/generate_204", "/gen_204", "/hotspot-detect.html", "/ncsi.txt"]
    got = []
    for p in paths:
        try:
            st, body, _ = http(host, p, timeout=5)
            got.append(f"{p}={st}")
        except urllib.error.HTTPError as e:
            got.append(f"{p}={e.code}")
        except Exception as e:
            got.append(f"{p}=ERR")
    ok = all("=200" in g for g in got)
    return ok, " ".join(got)


def ws_connect(host, path, timeout=8):
    """Minimal RFC 6455 client — no `websockets` package on an offline machine."""
    # host may carry an explicit port (the mock runs on 3137); a real device is :80.
    hostname, _, port = host.partition(":")
    s = socket.create_connection((hostname, int(port) if port else 80), timeout=timeout)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
               f"Sec-WebSocket-Version: 13\r\n\r\n").encode())
    hdr = b""
    while b"\r\n\r\n" not in hdr:
        c = s.recv(1)
        if not c: raise RuntimeError("closed during handshake")
        hdr += c
    if b"101" not in hdr.split(b"\r\n")[0]:
        raise RuntimeError(f"handshake: {hdr.split(chr(13).encode())[0]!r}")
    accept = base64.b64encode(hashlib.sha1(
        (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
    if accept.encode() not in hdr:
        raise RuntimeError("Sec-WebSocket-Accept mismatch")
    return s


def _exact(s, n):
    """recv() returns what it has, not what you asked for. A 15 KB layout frame
    arrives in MTU-sized pieces, and reading once truncates it."""
    b = b""
    while len(b) < n:
        c = s.recv(n - len(b))
        if not c: raise RuntimeError("peer closed mid-frame")
        b += c
    return b


def ws_recv(s, timeout=6):
    """Reassemble one WebSocket MESSAGE, which may span several frames.

    AsyncWebSocket fragments anything larger than its buffer, so the dashboard's
    layout push arrives as a text frame with FIN=0 followed by continuation
    frames (opcode 0). Browsers reassemble transparently; a hand-rolled client
    must do it explicitly, and not doing so looked exactly like the device
    truncating its own JSON."""
    s.settimeout(timeout)
    msg = b""
    while True:
        h = _exact(s, 2)
        fin    = h[0] & 0x80
        opcode = h[0] & 0x0F
        masked = h[1] & 0x80
        ln = h[1] & 0x7F
        if ln == 126: ln = struct.unpack(">H", _exact(s, 2))[0]
        elif ln == 127: ln = struct.unpack(">Q", _exact(s, 8))[0]
        mask = _exact(s, 4) if masked else None
        body = _exact(s, ln) if ln else b""
        if mask:
            body = bytes(b ^ mask[i & 3] for i, b in enumerate(body))
        if opcode == 0x8:                      # close
            raise RuntimeError("peer sent close")
        if opcode in (0x9, 0xA):               # ping / pong interleave mid-message
            continue
        msg += body
        if fin:
            return msg


def ws_send(s, obj):
    p = json.dumps(obj).encode()
    mask = os.urandom(4)
    n = len(p)
    hdr = b"\x81" + (bytes([0x80 | n]) if n < 126 else b"\xfe" + struct.pack(">H", n))
    s.sendall(hdr + mask + bytes(b ^ mask[i & 3] for i, b in enumerate(p)))


def t_dash_ws(host):
    s = ws_connect(host, "/dash/ws")
    try:
        frames, t0 = [], time.time()
        while time.time() - t0 < 6 and len(frames) < 3:
            try: frames.append(json.loads(ws_recv(s, 3)))
            except Exception: break
        kinds = [f.get("type") for f in frames]
        layout = next((f for f in frames if f.get("type") == "layout"), None)
        n = len(layout.get("cards", [])) if layout else 0
        tabs = len(layout.get("tabs", [])) if layout else 0
        return ("layout" in kinds and n > 0), f"frames={kinds}, cards={n}, tabs={tabs}"
    finally:
        s.close()


def t_dash_cmd(host):
    """Send a cmd frame and confirm the device rebroadcasts the new value."""
    s = ws_connect(host, "/dash/ws")
    try:
        layout = None
        for _ in range(4):
            m = json.loads(ws_recv(s, 4))
            if m.get("type") == "layout": layout = m; break
        if not layout: return False, "no layout frame"
        card = next((c for c in layout["cards"] if c.get("type") == "slider"), None)
        if not card: return False, "no slider card to drive"
        want = str(int(float(card.get("min", 0))) + 1)
        ws_send(s, {"type": "cmd", "id": card["id"], "value": want})
        t0 = time.time()
        while time.time() - t0 < 5:
            m = json.loads(ws_recv(s, 3))
            if m.get("type") == "upd":
                for c in m.get("cards", []):
                    if c.get("id") == card["id"] and str(c.get("value")) == want:
                        return True, f"{card['id']} echoed {want!r}"
        return False, f"no echo of {card['id']}={want}"
    finally:
        s.close()


def t_serial_ws(host):
    s = ws_connect(host, "/serial/ws")
    try:
        m = json.loads(ws_recv(s, 6))
        n = len(m.get("lines", []))
        return m.get("type") == "hist", f"type={m.get('type')}, replayed {n} lines"
    finally:
        s.close()


def t_ota_upload(host, firmware):
    """A real multipart OTA upload of a real image. The device reboots on success."""
    if not firmware or not os.path.exists(firmware):
        return False, "firmware .bin not found"
    body = open(firmware, "rb").read()
    b = "----vecti%s" % base64.b16encode(os.urandom(6)).decode()
    pre = (f"--{b}\r\nContent-Disposition: form-data; name=\"update\"; "
           f"filename=\"fw.bin\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
    post = f"\r\n--{b}--\r\n".encode()
    data = pre + body + post
    st, resp, _ = http(host, "/ota/upload?mode=firmware", timeout=180, method="POST",
                       data=data, headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    return st == 200, f"{st} {resp[:40]!r}, {len(body)} B image"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="192.168.4.1")
    ap.add_argument("--firmware", default="demo/.pio/build/esp32s3-n8r2/firmware.bin")
    ap.add_argument("--skip-ota", action="store_true",
                    help="the OTA test reboots the device, so it runs last")
    a = ap.parse_args()

    print(f"VectiSuite hardware verification against {a.host}\n")
    check("GET /  -> 302 /dash",        lambda: t_dash_redirect(a.host))
    check("GET /dash   (gzip HTML)",    t_page(a.host, "/dash"))
    check("GET /ota    (gzip HTML)",    t_page(a.host, "/ota"))
    check("GET /serial (gzip HTML)",    t_page(a.host, "/serial"))
    check("GET /wifi   (gzip HTML)",    t_page(a.host, "/wifi"))
    check("GET /ota/info    JSON",      lambda: t_ota_info(a.host))
    check("GET /wifi/status JSON",      lambda: t_wifi_status(a.host))
    check("captive-portal probes",      lambda: t_captive(a.host))
    check("WS /dash/ws  layout push",   lambda: t_dash_ws(a.host))
    check("WS /dash/ws  cmd round trip",lambda: t_dash_cmd(a.host))
    check("WS /serial/ws history",      lambda: t_serial_ws(a.host))
    if not a.skip_ota:
        check("POST /ota/upload (real image)", lambda: t_ota_upload(a.host, a.firmware))

    n_pass = sum(1 for r in results if r[0] == PASS)
    print(f"\n{n_pass}/{len(results)} passed")
    return 0 if n_pass == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
