#!/usr/bin/env python3
"""Add a uniform Author/Email header to every source file in the
mcu_libraries/ tree, and scrub any keyword strings borrowed from the
reference libraries (NetWizard, ElegantOTA, WebSerial, ESP-DASH).

Idempotent: re-running is a no-op once headers are in place.

Run from the repo root:
    python3 tools/stamp_authors.py
"""
import pathlib, re, json

AUTHOR = "Chinmoy Bhuyan"
EMAIL  = "dikibhuyan@gmail.com"
YEAR   = "2026"
ROOT   = pathlib.Path(__file__).resolve().parent.parent

# Comment styles per extension.
COMMENT = {
    ".h":   "//",  ".hpp": "//",  ".c": "//", ".cpp": "//", ".ino": "//",
    ".py":  "#",
    ".ini": ";",
    ".sh":  "#",
}
# JSON has no comment syntax; we add the fields inline instead.

SKIP_DIRS = {".pio", "build", ".git", ".pioenvs", ".vscode", "__pycache__"}

HEADER_MARK = "Author: Chinmoy Bhuyan"  # presence test for idempotency

# Words in library.json that came from the reference projects. We swap them
# for our own brand-aligned keywords.
KEYWORD_MAP = {
    "netwizard":  "joulenet",
    "elegantota": "jouleota",
    "espdash":    "jouledash",
    "webserial":  "jouleserial",
}

def stamp_text(src: str, ext: str) -> str:
    if HEADER_MARK in src:
        return src
    c = COMMENT.get(ext)
    if not c:
        return src
    block = (
        f"{c} ---------------------------------------------------------------------------\n"
        f"{c} JouleSuite for ESP32 / ESP8266 — JouleOTA · JouleSerial · JouleNet · JouleDash\n"
        f"{c} Author: {AUTHOR}\n"
        f"{c} Email:  {EMAIL}\n"
        f"{c} (c) {YEAR} — MIT License\n"
        f"{c} ---------------------------------------------------------------------------\n\n"
    )
    return block + src

def stamp_json(p: pathlib.Path) -> bool:
    """library.json gets an `authors` block + keyword scrub."""
    data = json.loads(p.read_text())
    changed = False

    # Author entry.
    target = {"name": AUTHOR, "email": EMAIL, "maintainer": True}
    cur = data.get("authors")
    if cur != [target]:
        data["authors"] = [target]; changed = True

    # Keyword scrub: split-merge while preserving order.
    if "keywords" in data:
        kws_raw = data["keywords"]
        items = [k.strip() for k in (kws_raw.split(",") if isinstance(kws_raw, str) else kws_raw)]
        cleaned = []
        for k in items:
            lk = k.lower()
            if lk in KEYWORD_MAP:
                rep = KEYWORD_MAP[lk]
                if rep not in cleaned: cleaned.append(rep)
            elif k not in cleaned:
                cleaned.append(k)
        new = ", ".join(cleaned) if isinstance(kws_raw, str) else cleaned
        if new != kws_raw:
            data["keywords"] = new; changed = True

    if changed:
        p.write_text(json.dumps(data, indent=2) + "\n")
    return changed

def main():
    n_stamped = n_json = 0
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file(): continue
        if any(part in SKIP_DIRS for part in p.parts): continue
        rel = p.relative_to(ROOT)

        if p.suffix == ".json":
            # library.json gets structured author + keyword fix
            if p.name == "library.json":
                if stamp_json(p):
                    print(f"  json  {rel}"); n_json += 1
            continue

        if p.suffix in COMMENT:
            old = p.read_text()
            new = stamp_text(old, p.suffix)
            if new != old:
                p.write_text(new)
                print(f"  stamp {rel}"); n_stamped += 1

    print(f"\n{n_stamped} files stamped, {n_json} library.json updated.")

if __name__ == "__main__":
    main()
