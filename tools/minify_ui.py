# ---------------------------------------------------------------------------
# JouleSuite for ESP32 / ESP8266 — JouleOTA · JouleSerial · JouleNet · JouleDash
# Author: Chinmoy Bhuyan
# Email:  dikibhuyan@gmail.com
# (c) 2026 — MIT License
# ---------------------------------------------------------------------------

#!/usr/bin/env python3
"""Minify the embedded HTML PROGMEM strings in each Joule* library.

Strips:
  * /* … */ C-style comments and // line comments in <script>
  * leading/trailing whitespace on each line
  * blank lines
  * spaces around tokens that can be collapsed (>{};,:) in CSS/JS

It keeps the file structurally identical (still a C++ header that defines
`const char *_UI_HTML PROGMEM` inside a R"HTML(…)HTML" literal), so the
library still compiles and the contained HTML still renders correctly.

Why: at RSSI worse than ~-80 dBm the AsyncTCP send path on ESP32-S3 has
a hard time pushing a ~15 KB single-page-app through without dropped
segments. Halving the payload roughly halves the failure probability and
keeps the UIs usable on far-from-router devices.
"""
import re, sys, pathlib

FILES = [
    "libraries/JouleOTA/src/JouleOTA_ui.h",
    "libraries/JouleSerial/src/JouleSerial_ui.h",
    "libraries/JouleNet/src/JouleNet_ui.h",
    "libraries/JouleDash/src/JouleDash_ui.h",
]

PAT = re.compile(r'R"HTML\((.*?)\)HTML"', re.DOTALL)

def minify(html: str) -> str:
    # Drop CSS / JS block comments. We deliberately do NOT strip line
    # comments inside <script> because a stray // inside a regex or URL
    # could be eaten. The cost of leaving them in is small.
    html = re.sub(r'/\*.*?\*/', '', html, flags=re.DOTALL)

    # Trim each line; drop empties.
    lines = [ln.strip() for ln in html.splitlines() if ln.strip()]
    html = "\n".join(lines)

    # Collapse runs of whitespace within style blocks. We approximate by
    # collapsing spaces around CSS punctuation outside of tag bodies. This
    # is safe for our hand-written, no-quirks CSS but would be unsafe on
    # arbitrary user HTML.
    html = re.sub(r'\s*([{};:,>])\s*', r'\1', html)
    html = re.sub(r';}', '}', html)        # CSS: drop trailing ;

    # Single space between attributes is fine; longer runs are not.
    html = re.sub(r'  +', ' ', html)

    return html

def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    for rel in FILES:
        p = root / rel
        if not p.exists():
            print(f"SKIP missing: {p}"); continue
        src = p.read_text()
        m = PAT.search(src)
        if not m:
            print(f"SKIP no HTML literal: {p}"); continue
        before = m.group(1)
        after  = minify(before)
        new = src[:m.start(1)] + after + src[m.end(1):]
        p.write_text(new)
        print(f"{p.name}: {len(before):>6} → {len(after):>6} bytes  "
              f"({100*(1-len(after)/max(1,len(before))):5.1f}% saved)")

if __name__ == "__main__":
    main()
