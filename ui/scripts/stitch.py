#!/usr/bin/env python3
"""
JouleSuite UI · stitch.py
Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT

Thin Python helper around the Google Stitch MCP server's HTTP transport.
Lets the rest of the toolchain drive Stitch from shell scripts:

  python3 stitch.py tools                            # list tools
  python3 stitch.py schema generate_screen_from_text # show input schema
  python3 stitch.py call create_project '{"title":"X"}'
  python3 stitch.py call generate_screen_from_text  - < args.json
  python3 stitch.py save_screen <project> <screen>   # writes HTML + PNG to ui/stitch-out/
"""
import json
import os
import sys
import time
import pathlib
import urllib.request

URL = "https://stitch.googleapis.com/mcp"
KEY = os.environ.get("STITCH_API_KEY")
if not KEY:
    sys.exit("set STITCH_API_KEY first")

OUT = pathlib.Path(__file__).resolve().parent.parent / "stitch-out"
OUT.mkdir(exist_ok=True)


def rpc(method, params=None, retries=3, timeout=60):
    body = {"jsonrpc": "2.0", "id": int(time.time() * 1000), "method": method}
    if params is not None:
        body["params"] = params
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        URL, data=data, method="POST",
        headers={
            "X-Goog-Api-Key": KEY,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode()
                # The server returns standard JSON-RPC; .result may contain
                # structured content + an MCP-style text payload that itself
                # is JSON-encoded. Callers pick whatever they want.
                return json.loads(raw)
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def cmd_tools(_):
    d = rpc("tools/list")
    for t in d.get("result", {}).get("tools", []):
        first_line = t.get("description", "").split("\n")[0]
        print(f"  {t['name']:38s} — {first_line[:90]}")


def cmd_schema(args):
    name = args[0]
    d = rpc("tools/list")
    for t in d.get("result", {}).get("tools", []):
        if t["name"] == name:
            print(json.dumps(t.get("inputSchema", {}), indent=2))
            return
    sys.exit(f"no such tool: {name}")


def cmd_call(args):
    name = args[0]
    raw = args[1] if len(args) > 1 and args[1] != "-" else sys.stdin.read()
    arguments = json.loads(raw) if raw.strip() else {}
    d = rpc("tools/call", {"name": name, "arguments": arguments}, timeout=300)
    # Print pretty, then also the structuredContent if any (for piping).
    print(json.dumps(d, indent=2))


def cmd_save_screen(args):
    """Pull HTML + PNG for a single screen, write under stitch-out/<slug>/."""
    project, screen, slug = args[0], args[1], args[2]
    target = OUT / slug
    target.mkdir(parents=True, exist_ok=True)

    # 1. Screen metadata + HTML
    d = rpc("tools/call", {"name": "get_screen", "arguments": {"name": screen}}, timeout=120)
    sc = d.get("result", {}).get("structuredContent") or {}
    # Sometimes the HTML is in result.content[0].text or in sc.code.html
    code = sc.get("code") or {}
    html = code.get("html") or _scrape_text(d)
    if html:
        (target / "screen.html").write_text(html)

    # 2. Optional image
    try:
        d2 = rpc("tools/call", {"name": "get_screen_image", "arguments": {"name": screen}}, timeout=120)
        img_b64 = (d2.get("result", {}).get("structuredContent") or {}).get("imageBase64")
        if img_b64:
            import base64
            (target / "screen.png").write_bytes(base64.b64decode(img_b64))
    except Exception as e:
        print("  (no image:", e, ")")

    (target / "meta.json").write_text(json.dumps(sc, indent=2))
    print(f"  ✓ {slug:30s}  html={'yes' if html else 'no'}  → {target}")


def _scrape_text(d):
    """Some calls deliver HTML inside result.content[0].text as a JSON string."""
    try:
        return d["result"]["content"][0]["text"]
    except Exception:
        return ""


CMDS = {
    "tools":       cmd_tools,
    "schema":      cmd_schema,
    "call":        cmd_call,
    "save_screen": cmd_save_screen,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in CMDS:
        sys.exit("usage: stitch.py {" + " | ".join(CMDS) + "} ...")
    CMDS[sys.argv[1]](sys.argv[2:])
