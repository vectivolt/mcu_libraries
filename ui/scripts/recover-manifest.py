#!/usr/bin/env python3
"""
JouleSuite UI · recover-manifest.py
Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT

Walk the project's actual screen list from Stitch, map each screen title
back to one of our slugs, and pull HTML + PNG into ui/stitch-out/<slug>/.

Used after parallel batches left the local manifest corrupted.
"""
import json, pathlib, sys, time, urllib.request, os

PROJECT_ID = "16086657541908603661"
URL = "https://stitch.googleapis.com/mcp"
KEY = os.environ.get("STITCH_API_KEY")
if not KEY: sys.exit("set STITCH_API_KEY first")

OUT = pathlib.Path(__file__).resolve().parent.parent / "stitch-out"
OUT.mkdir(exist_ok=True)

# Title → slug. Tolerate minor variations in Stitch's auto-generated titles.
TITLE_MAP = {
    "JouleDash Overview":                              ("DESKTOP", "dash-overview-desktop"),
    "JouleDash Overview (Mobile)":                     ("MOBILE",  "dash-overview-mobile"),
    "JouleDash Energy Overview":                       ("DESKTOP", "dash-energy-desktop"),
    "JouleDash Controls":                              ("DESKTOP", "dash-controls-desktop"),
    "JouleDash Diagnostics":                           ("DESKTOP", "dash-diag-desktop"),
    "JouleDash Widget Gallery":                        ("DESKTOP", "dash-widget-gallery"),

    "JouleOTA Idle":                                   ("DESKTOP", "ota-idle-desktop"),
    "JouleOTA":                                        ("DESKTOP", "ota-idle-desktop"),
    "JouleOTA Uploading Firmware":                     ("DESKTOP", "ota-uploading-desktop"),
    "JouleOTA Pull URL Mode":                          ("DESKTOP", "ota-pull-desktop"),
    "JouleOTA Update Success":                         ("DESKTOP", "ota-success-desktop"),
    "JouleOTA Mobile (Idle)":                          ("MOBILE",  "ota-mobile"),

    "JouleSerial Wireless Console":                    ("DESKTOP", "serial-active-desktop"),
    "JouleSerial Console - Filtered (wifi|rssi)":      ("DESKTOP", "serial-filter-desktop"),
    "JouleSerial Console (Filtered)":                  ("DESKTOP", "serial-filter-desktop"),
    "JouleSerial Hex View Console":                    ("DESKTOP", "serial-hex-desktop"),
    "JouleSerial Mobile Console":                      ("MOBILE",  "serial-mobile"),

    "JouleNet Wi-Fi Portal (Scanning)":                ("DESKTOP", "net-scan-desktop"),
    "JouleNet Wi-Fi Scan":                             ("DESKTOP", "net-scan-desktop"),
    "JouleNet Wi-Fi Portal (Networks List)":           ("DESKTOP", "net-list-desktop"),
    "JouleNet Advanced Configuration Expanded":        ("DESKTOP", "net-advanced-desktop"),
    "JouleNet Connecting State":                       ("DESKTOP", "net-connecting-desktop"),
    "JouleNet Setup (Parameters)":                     ("DESKTOP", "net-setup-desktop"),
    "JouleNet Status Tab":                             ("DESKTOP", "net-status-desktop"),
    "JouleNet Wi-Fi Portal (Mobile)":                  ("MOBILE",  "net-mobile"),
}


def rpc(method, params=None, timeout=120):
    body = {"jsonrpc": "2.0", "id": int(time.time() * 1000), "method": method}
    if params is not None: body["params"] = params
    req = urllib.request.Request(
        URL, data=json.dumps(body).encode(), method="POST",
        headers={"X-Goog-Api-Key": KEY, "Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def call(name, args, timeout=120):
    d = rpc("tools/call", {"name": name, "arguments": args}, timeout=timeout)
    return d.get("result", {})


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"X-Goog-Api-Key": KEY})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def slug_for(title, device):
    """Best-effort title → slug map. Falls back to fuzzy substring match."""
    pair = TITLE_MAP.get(title)
    if pair and pair[0] == device:
        return pair[1]
    # Fuzzy: pick the first slug whose title prefix matches.
    lt = title.lower()
    for k, (dev, slug) in TITLE_MAP.items():
        if dev != device: continue
        if k.lower() in lt or lt.startswith(k.lower()):
            return slug
    return None


def main():
    # 1. Pull list_screens to discover everything in the project.
    print("listing project screens …")
    r = call("list_screens", {"projectId": PROJECT_ID}, timeout=120)
    sc = r.get("structuredContent") or {}
    screens = sc.get("screens", [])
    print(f"  found {len(screens)} screens")

    manifest = []
    by_slug = {}
    for s in screens:
        title = s.get("title", "")
        dev   = s.get("deviceType", "")
        if title == "DESIGN.md": continue
        slug = slug_for(title, dev)
        if not slug:
            print(f"  ? no slug for: {title!r} ({dev})")
            continue
        # If we already mapped this slug (duplicate titles), keep the newer one.
        by_slug.setdefault(slug, s)

    print(f"  mapped {len(by_slug)} screens to slugs")

    # 2. For each mapped screen, get_screen (full details with downloadUrls),
    #    then fetch html + png.
    for slug, s in by_slug.items():
        name = s.get("name") or s.get("id")
        if name and not name.startswith("projects/"):
            name = f"projects/{PROJECT_ID}/screens/{name}"
        print(f"  ↓  {slug:32s}  ←  {name.split('/')[-1] if name else '?'}")
        target = OUT / slug
        target.mkdir(parents=True, exist_ok=True)

        try:
            r = call("get_screen", {"name": name}, timeout=120)
            sc2 = r.get("structuredContent") or {}
            (target / "meta.json").write_text(json.dumps(sc2, indent=2))

            html_url = (sc2.get("htmlCode") or {}).get("downloadUrl")
            png_url  = (sc2.get("screenshot") or {}).get("downloadUrl")
            if html_url:
                (target / "screen.html").write_bytes(fetch(html_url, timeout=60))
            if png_url:
                (target / "screen.png").write_bytes(fetch(png_url, timeout=120))

            manifest.append({"slug": slug, "screenName": name, "title": sc2.get("title"),
                             "deviceType": sc2.get("deviceType")})
        except Exception as e:
            print(f"     ✗ {e}")

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nrecovered {len(manifest)} screens → ui/stitch-out/manifest.json")


if __name__ == "__main__":
    main()
