#!/usr/bin/env python3
"""
JouleSuite UI · pull-screens.py
Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT

Walks ui/stitch-out/manifest.json, extracts each Stitch screen's real
resource name + htmlCode.downloadUrl + screenshot.downloadUrl, then
fetches both into ui/stitch-out/<slug>/{screen.html, screen.png, meta.json}.
"""
import json, pathlib, sys, urllib.request, os, ssl

OUT = pathlib.Path(__file__).resolve().parent.parent / "stitch-out"
KEY = os.environ.get("STITCH_API_KEY")
if not KEY:
    sys.exit("set STITCH_API_KEY first")


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"X-Goog-Api-Key": KEY})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def find_screen(entry):
    """Dig the real screen + downloadUrls out of the structuredContent that
    generate_screen_from_text returned."""
    sc = entry.get("structuredContent") or {}
    for c in (sc.get("outputComponents") or []):
        d = c.get("design")
        if d:
            screens = d.get("screens", [])
            if screens:
                return screens[0]
    return None


def main():
    manifest = json.loads((OUT / "manifest.json").read_text())
    updated = []
    for entry in manifest:
        slug = entry["slug"]
        screen = find_screen(entry)
        if not screen:
            print(f"  ⏭  {slug:32s}  (no screen found)")
            updated.append(entry); continue

        target = OUT / slug
        target.mkdir(parents=True, exist_ok=True)
        (target / "meta.json").write_text(json.dumps(screen, indent=2))

        html_url = (screen.get("htmlCode") or {}).get("downloadUrl")
        png_url  = (screen.get("screenshot") or {}).get("downloadUrl")
        bytes_html = bytes_png = 0
        if html_url:
            try:
                data = fetch(html_url, timeout=60)
                (target / "screen.html").write_bytes(data)
                bytes_html = len(data)
            except Exception as e:
                print(f"     html download failed: {e}")
        if png_url:
            try:
                data = fetch(png_url, timeout=60)
                (target / "screen.png").write_bytes(data)
                bytes_png = len(data)
            except Exception as e:
                print(f"     png download failed: {e}")

        print(f"  ↓  {slug:32s}  html={bytes_html:>6}  png={bytes_png:>6}")
        entry["screenId"]   = screen.get("id")
        entry["screenName"] = screen.get("name")
        entry["title"]      = screen.get("title")
        updated.append(entry)

    (OUT / "manifest.json").write_text(json.dumps(updated, indent=2))
    print()
    ok = sum(1 for e in updated if e.get("screenId"))
    print(f"  → {ok} / {len(updated)} pulled")


if __name__ == "__main__":
    main()
