#!/usr/bin/env python3
"""
JouleSuite UI · generate-screens.py
Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT

Bulk-generate every JouleSuite UI screen from text prompts via Google
Stitch's MCP. Each entry specifies a slug, target device, and a detailed
prompt referencing our DESIGN.md vocabulary.

Usage:
    STITCH_API_KEY=… python3 ui/scripts/generate-screens.py [--only dash|ota|serial|net]
"""
import argparse, json, pathlib, sys, time, urllib.request, os

PROJECT_ID = "16086657541908603661"
URL = "https://stitch.googleapis.com/mcp"
KEY = os.environ.get("STITCH_API_KEY")
if not KEY:
    sys.exit("set STITCH_API_KEY first")

OUT = pathlib.Path(__file__).resolve().parent.parent / "stitch-out"
OUT.mkdir(exist_ok=True)


def rpc(method, params=None, timeout=300, retries=2):
    body = {"jsonrpc": "2.0", "id": int(time.time() * 1000), "method": method}
    if params is not None:
        body["params"] = params
    req = urllib.request.Request(
        URL, data=json.dumps(body).encode(), method="POST",
        headers={
            "X-Goog-Api-Key": KEY,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt == retries - 1:
                raise
            print(f"  retry {attempt+1}: {e}", file=sys.stderr)
            time.sleep(2 ** attempt)


def call(name, args, timeout=300):
    d = rpc("tools/call", {"name": name, "arguments": args}, timeout=timeout)
    if d.get("error"):
        raise RuntimeError(d["error"])
    res = d.get("result", {})
    if res.get("isError"):
        text = "".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")
        raise RuntimeError(f"tool error: {text}")
    return res


BASE_RULES = """
Use the JouleSuite DESIGN.md vocabulary uploaded to this project:
- dark theme by default, near-black bg #08090f with subtle indigo+violet
  gradient blur blobs behind the page
- single accent family: brand #6366f1 (indigo) + brand-2 #8b5cf6 (violet),
  only together in a 135deg gradient, never with any other hue
- semantic colours ok #10b981, warn #f59e0b, err #ef4444, info #06b6d4 —
  ONLY for status dots, pills, log badges, toast borders. Never the brand.
- Card surface #11131c, hairline border rgb(255 255 255/.06), radius 20px,
  drop shadow 0 24px 48px -16px rgb(0 0 0/.55), top-half sheen overlay
- Inter sans for everything except mono fields (JetBrains Mono)
- Big numeric KPIs use weight 300, size 32-48px, tabular-nums
- Section labels small caps, weight 600, letter-spacing 1px, muted colour
- Status dots are 6px circles with a 4px 18%-opacity ring; ok pulses
- Pill buttons (radius 99); primary uses brand gradient + glow shadow
- Hover state lifts cards/buttons by 2px
- Mobile-first responsive 12-col grid
- Iconography Lucide, stroke 2.2, sizes 14-18px
"""

SCREENS = [
    # ============================================================
    # JouleDash — Real-time IoT dashboard
    # ============================================================
    {"lib":"dash","slug":"dash-overview-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleDash dashboard — Overview tab — desktop 1280x900.

Sticky header (88% opaque bg, blurred): brand-gradient logo tile with bolt
icon, title "JouleSuite EV Charger", subtitle "live dashboard", online status
pill with pulsing green dot, theme toggle.

Sticky pill tab bar below: Overview (active, font-weight 600, subtle filled
background), Energy, Controls, Diagnostics.

Main 12-col grid:
- Hero card col-span 12: brand-gradient 64px tile with bolt, small caps
  "BAY 3 · JOULESUITE DEMO" label, 24px gradient-fill title
  "Charging · 7.20 kW · 47%", muted subtitle "OCPP 1.6 · CCS2 connector ·
  32 A type-2 cable", two right pills: green "live" and indigo "RFID linked".
- Four KPI cards col-span 3 each with left semantic strip:
  - POWER OUTPUT 6.81 kW (info blue) + inline sparkline
  - ENERGY DELIVERED 0.298 kWh (success green) + sparkline
  - SESSION COST INR 3 (primary indigo)
  - SESSION TIME 5 min (plain)
- CHARGER STATE card col-span 4: green dot pill "ok"
- BATTERY SOC donut col-span 4: SVG ring at 47%, brand gradient stroke,
  centre mono label "47%"
- CHARGE POWER half-gauge col-span 4: semicircle arc at 6.8/22 kW,
  brand gradient, mono centre "6.8kW"

Dark palette, generous spacing, glass cards with sheen and crisp shadows.
"""},
    {"lib":"dash","slug":"dash-overview-mobile","device":"MOBILE","prompt":BASE_RULES+"""
JouleDash dashboard — Overview tab — mobile 390x844.

Same header + tabs (compressed). Tab bar horizontally scrollable,
Overview active. Grid collapses to 2 columns:
- Hero card spans 2 cols, vertical stack
- 4 KPI cards each span 1 col with left accent + sparkline
- CHARGER STATE 1 col with green dot pill
- BATTERY SOC donut 1 col at 70%
- CHARGE POWER gauge 1 col at 6.9 kW
Sticky bottom CTA brand-gradient "Pause session" button. 44px touch targets.
"""},
    {"lib":"dash","slug":"dash-energy-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleDash — Energy tab — desktop 1280x900. Same header. Energy tab active.

Grid:
- Four phase-detail KPI cards col-span 3: Voltage L1 230.4 V (info),
  Current L1 31.6 A (warning), Power factor 0.974, Frequency 50.02 Hz
- DAILY QUOTA progress card col-span 6, 100px tall: small caps label,
  thick gradient progress fill at 47%, mono % to right
- RENEWABLE MIX donut card col-span 6: 78% green-tinted donut, sublabel
  "solar + wind"
- POWER OVER TIME area chart card col-span 12: 220px tall, brand gradient
  stroke + soft fill, last-point dot, faint gridlines, X minute ticks

Chart card is the visual centrepiece.
"""},
    {"lib":"dash","slug":"dash-controls-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleDash — Controls tab — desktop 1280x900. Header + tabs unchanged.

Grid of interactive widgets:
- Start session toggle card col-span 3: big toggle on, brand gradient + glow
- Current limit slider card col-span 6: 6-32 A, thumb at 22A, mono bubble
  "22 A" in brand colour above thumb
- Charge mode slider col-span 3: 0-3 stepped, label "Standard/Eco/Boost/Solar"
- LED ring colour card col-span 3: swatch + "#6366f1" mono
- Emergency STOP button col-span 3: big red gradient with alert icon
- Reboot device col-span 3: warning amber ghost
- Camera pan/tilt joystick col-span 6: 140px round pad with brand-gradient
  nub, dashed inner ring, x=0 y=0 mono readout
- Driver RFID tag input col-span 6: text input "scan or type tag UID"
"""},
    {"lib":"dash","slug":"dash-diag-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleDash — Diagnostics tab — desktop 1280x900. Diagnostics active.

Sensor & health cards:
- PCB TEMPERATURE 38.4 C (warning) col-span 3 + sparkline
- CABINET HUMIDITY 43.1 % (info) col-span 3 + sparkline
- Wi-Fi RSSI -86 dBm col-span 3 + sparkline
- FREE HEAP 248 KB col-span 3 + sparkline
- UPTIME 246 s col-span 4
- NETWORK LINK status pill "ok" green col-span 4
- OCPP BACKEND status pill "ok" green col-span 4
- RSSI HISTORY chart card col-span 12: 180px line chart, brand gradient

Bottom-right corner: success toast "Energy delivered: 3.132 kWh" with
green left bar.
"""},
    {"lib":"dash","slug":"dash-widget-gallery","device":"DESKTOP","prompt":BASE_RULES+"""
JouleDash WIDGET GALLERY screen — every widget type in one dashboard,
desktop 1280x900. Three pill tabs: Display / Interactive / Indicators;
Display active.

Sections:
1. DISPLAY row: Number "7.42 kW" + sparkline, Temperature "23.4 C" red
   accent, Humidity "48 %" blue accent, Status with green dot "Online"
2. TEXT row: Text Input card with placeholder, Image card 16:9 brand-
   gradient block
3. INTERACTIVE row: Brand-gradient Button card, On Toggle card, Slider
   card value 73 mono bubble, Joystick card with brand-gradient nub,
   Colour picker card swatch + hex
4. INDICATORS row: Progress bar at 64% brand-gradient fill, Half-gauge
   at 72%, Donut at 81%, Chart with smooth area trend

Each widget in standard card with sheen, shadow, hairline border.
"""},

    # ============================================================
    # JouleOTA — Firmware updater
    # ============================================================
    {"lib":"ota","slug":"ota-idle-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleOTA firmware updater — idle state — desktop 1280x900.

Centred max-width 780px column. Header: brand-gradient 36px logo with
Lucide Upload icon, title "JouleSuite OTA", subtitle "drag a firmware to
flash". Pulsing green "live" pill and theme toggle on right.

Stacked cards:
1. DEVICE info card — 2x3 grid of compact KV chips inside soft panel-2
   rounded rects with small-caps labels and mono values:
   HARDWARE ID  D0:CF:13:73:0A:B8 / FIRMWARE 1.0.0+demo /
   CURRENT SLOT app0 / NEXT SLOT app1 /
   FREE FOR OTA 3.19 MB / FREE HEAP 245.4 KB

2. UPLOAD card with three pill tabs: "Firmware" (active brand gradient,
   white text, glow), "Filesystem", "Pull URL". Below: giant rounded
   dashed drop-zone ~280px tall. Centred 56px brand-tinted circle with
   Lucide Upload icon, bold "Drop a .bin here" with .bin styled mono
   in brand colour, sub-text "or click to browse · accepts .bin and .bin.gz".

3. MAINTENANCE card: small caps label, explanation, two bottom-row buttons —
   Commit current (ghost border with Cpu icon), Rollback (red gradient
   destructive with RefreshCw icon).

Background has subtle indigo+violet gradient blur blobs.
"""},
    {"lib":"ota","slug":"ota-uploading-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleOTA — uploading state — desktop 1280x900.

Same layout. UPLOAD card now shows progress under the dimmed drop-zone:
- 96px SVG progress ring left: bg ring muted line colour, fg ring stroked
  with brand gradient (brand to brand-2), linecap round, drawn at ~58%
- Right text: huge 28px gradient-filled mono "57.4%", muted byte counter
  "654 KB / 1.14 MB", "112 KB/s" speed line below

Below ring, small terminal-style log box (mono 11.5px) with 4 lines:
  → firmware.bin  1.14 MB  as firmware
  • start:firmware
  • 25%
  • 50%

Header, device card, maintenance card unchanged.
"""},
    {"lib":"ota","slug":"ota-pull-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleOTA — Pull URL mode — desktop 1280x900.

Same layout. UPLOAD card: tab "Pull URL" active. Drop-zone replaced with
mono URL input "https://builds.example.com/v1.2.3/firmware.bin". Below:
two buttons — primary brand-gradient "Pull & flash" with Lucide Cloud
icon, ghost "Cancel".
"""},
    {"lib":"ota","slug":"ota-success-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleOTA — success state — desktop 1280x900.

Same layout as uploading. Progress ring at 100% solid brand gradient. Mono
headline "100.0%". Subtitle "complete — rebooting in 3s". Log box ends with
green "done — rebooting" line. Bottom-right success toast "Update applied"
with green ok left bar. Drop zone dimmed. Header status pill amber "updating".
"""},
    {"lib":"ota","slug":"ota-mobile","device":"MOBILE","prompt":BASE_RULES+"""
JouleOTA — mobile 390x844, idle state.

Single column. Cards stack. Header has logo + title only. Device card uses
single-column KV chips. Upload tabs wrap if needed. Drop-zone full width
min 260px tall. Maintenance buttons stack vertically.
"""},

    # ============================================================
    # JouleSerial — Wireless console
    # ============================================================
    {"lib":"serial","slug":"serial-active-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleSerial wireless console — active stream — desktop 1280x900.

Full-bleed layout (no central column). Three bands:

Top header ~52px: brand-gradient 32px logo tile with Lucide Terminal icon,
title "JouleSerial Console", mono sublabel "online · 3 clients" with
pulsing green dot. Theme toggle right.

Toolbar ~48px under header, left to right:
- Search input with Search icon + placeholder "filter — regex ok · press /"
- Level dropdown "INFO+"
- "Auto" pill highlighted brand (autoscroll on)
- "rel" pill (timestamps)
- "text" pill (vs hex)
- Font-size dropdown "13px"
- "export" dropdown
- "Clear" ghost with eraser icon
- Right-aligned stat chip row: dbg 4, inf 28, wrn 1, err 0, rate 6/s, total 33

Main log pane (rest of viewport): JetBrains Mono 13px, lines packed tight.
Each row: 82px mono timestamp ("12.847s"), 52px tinted level badge
(INF green / DBG cyan / WRN amber / ERR red — filled tints, white text),
then ink-colour message.

Sample 18 lines mixing levels:
  12.847s INF HTTP server up
  12.852s INF mDNS: http://joule-demo.local
  13.001s INF netState=connecting
  13.420s INF netState=connected
  14.012s DBG heap=246412 rssi=-86
  16.025s WRN rssi=-87 weak
  16.512s INF recv> heap
  16.515s INF heap = 252120 bytes

Bottom command bar ~60px blurred: mono text input full width "type a
command — Enter to send · arrow keys history · / to focus filter". Right:
brand-gradient "Send" pill with Lucide Send icon.

Reads like a polished modern terminal app, not a generic web log.
"""},
    {"lib":"serial","slug":"serial-filter-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleSerial — filter applied — desktop 1280x900.

Same active screen but:
- Search field contains "wifi|rssi" with yellow soft highlight
- Level select reads "WARN+"
- Log shows only matching rows, each with substring highlighted amber
- Total chip drops to 7
"""},
    {"lib":"serial","slug":"serial-hex-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleSerial — hex view — desktop 1280x900.

Same layout. Toolbar "hex" pill active brand outline. Log rows show each
message as hex byte pairs space-separated, eg
"6e 65 74 53 74 61 74 65 3d 63 6f 6e 6e 65 63 74 65 64".
"""},
    {"lib":"serial","slug":"serial-mobile","device":"MOBILE","prompt":BASE_RULES+"""
JouleSerial — mobile 390x844.

Single column. Header compressed; clients count under title. Toolbar wraps:
row 1 filter+level+Auto, row 2 time/hex/font/export/clear. Stat chips hidden
or single horizontal scroll strip. Log pane fills middle, font 12px. Command
bar bottom 80% input + small brand send button.
"""},

    # ============================================================
    # JouleNet — Wi-Fi provisioning portal
    # ============================================================
    {"lib":"net","slug":"net-scan-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleNet Wi-Fi portal — scanning state — desktop, centred 600px column on
dark bg with standard indigo+violet blur blobs.

Header: brand-gradient 36px logo with Lucide Wifi icon, title "JouleSuite
Setup", subtitle "pick a network · apply settings", theme toggle.

Segmented control three tabs: "Wi-Fi" (active brand gradient pill, white,
glow), "Setup", "Status".

Main card: small caps "AVAILABLE NETWORKS" label left, ghost "Rescan"
button with Lucide RotateCcw icon (spinning) right. Below: 4 placeholder
shimmer rows (12px rounded rect with moving brand-tinted shimmer animation).

Then PASSWORD label + password input. Then "OR JOIN HIDDEN SSID" + text
input. Indigo link "Advanced (static IP · hostname · country)" — collapsed.

Bottom of card: full-width primary brand-gradient "Connect" button with
Lucide Power icon (disabled / dimmed because no SSID picked).

Footer: "JouleNet · MIT · ESP32 / ESP8266 · Chinmoy Bhuyan".
"""},
    {"lib":"net","slug":"net-list-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleNet Wi-Fi portal — networks list — desktop.

Same header + tabs (Wi-Fi active). Same card. AVAILABLE NETWORKS section
now shows 5 rows. Each row: 4-bar SVG signal indicator left (bars filled
brand colour by RSSI), flex info block with bold SSID and mono metadata
"ch 10 · -52 dBm · 28:EE:52:EA:23:FC", right side Lucide Lock icon if
secured.

Two rows strong (4 bars), two medium, one weak. Third row "Rajesh k" is
SELECTED: indigo brand 12%-tint bg, hairline brand border, stronger shadow.

Password input below contains "•••••••••". Connect button enabled, brand
gradient ready.
"""},
    {"lib":"net","slug":"net-advanced-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleNet — advanced expanded — desktop.

Same card and selected network. "Advanced" link now "Advanced (static IP ·
hostname · country)" expanded. Reveal block slides down:
- HOSTNAME (mDNS) input with placeholder "joule-demo"
- 2-col: COUNTRY input "IN" maxlength 2, STATIC IP input "(DHCP)"
- 2-col: GATEWAY input, NETMASK input "255.255.255.0"

Dark glass inputs with hairline borders that brighten to brand on focus.
"""},
    {"lib":"net","slug":"net-connecting-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleNet — connecting state — desktop.

Same card. Connect button busy: brand gradient slightly dimmed, contents
replaced with Lucide RotateCcw spinning + "Connecting…", disabled.

Centered above network list: thin info-blue strip card with Lucide Info
icon, "Trying Rajesh k…", small mono "attempt 1 of 3" right.
"""},
    {"lib":"net","slug":"net-setup-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleNet — Setup (parameters) tab — desktop.

Segmented tabs: Wi-Fi, "Setup" active brand-gradient pill, Status.

PARAMETERS form:
- Section header "APPLICATION" brand indigo small caps
- Charger name TEXT input "Bay 3 · JouleSuite Demo"
- MQTT host TEXT input "broker.local"
- 2-col: MQTT port NUMBER "1883" / MQTT password PASSWORD dots
- Region DROPDOWN "IN"
- Accent colour COLOR — swatch reading "#6366f1"
- Verbose logs TOGGLE row: label left, ON toggle (brand gradient + glow) right
- Section divider "NOTES" with hairline rule
- Site notes TEXTAREA 80px mono content "Bay 3, ground floor.\\nMounted
  on west pillar.\\nKey under reception."

Big primary brand-gradient "Save settings" button bottom.
"""},
    {"lib":"net","slug":"net-status-desktop","device":"DESKTOP","prompt":BASE_RULES+"""
JouleNet — Status tab — desktop.

Segmented tabs: Status active brand-gradient pill.

Live diagnostics KV rows separated by dashed hairlines:
  STATE     connected
  SSID      Rajesh k
  IP        192.168.1.100
  GATEWAY   192.168.1.1
  NETMASK   255.255.255.0
  DNS       192.168.1.1
  BSSID     28:EE:52:EA:23:FC
  CHANNEL   10
  RSSI      -86 dBm
  HOSTNAME  joule-demo
  mDNS      joule-demo.local
  MAC       D0:CF:13:73:0A:B8
  HEAP      245 KB
  UPTIME    246 s

Bottom row: ghost "Restart" left, red gradient destructive "Erase & reboot"
right with Lucide Trash2 icon.
"""},
    {"lib":"net","slug":"net-mobile","device":"MOBILE","prompt":BASE_RULES+"""
JouleNet — mobile 390x844 — Wi-Fi tab, networks listed.

Single full-width card. Compressed logo + title. Segmented tab row scrolls
horizontally if needed. 5 network rows full card width with signal bars,
SSID, metadata, lock icon. Metadata ellipsis if overflow. Password input
+ Connect button bottom. Sticky bottom safe-area padding so Connect button
clears home indicator.
"""},
]


def generate(only=None):
    manifest = []
    # Preserve previous progress so we can resume.
    mf_path = OUT / "manifest.json"
    if mf_path.exists():
        try: manifest = json.loads(mf_path.read_text())
        except Exception: manifest = []
    done = {x["slug"] for x in manifest if x.get("screenName")}

    for s in SCREENS:
        if only and s["lib"] != only:
            continue
        slug = s["slug"]
        if slug in done:
            print(f"  ⏭  {slug:32s} already done")
            continue
        print(f"  → {slug:32s} ({s['device']}) …", end=" ", flush=True)
        try:
            r = call("generate_screen_from_text", {
                "projectId": PROJECT_ID,
                "prompt": s["prompt"],
                "deviceType": s["device"],
                "modelId": "GEMINI_3_1_PRO",
            }, timeout=300)
            sc = r.get("structuredContent") or {}
            screen_name = sc.get("name") or sc.get("sourceScreen") or ""
            if not screen_name:
                text = "".join(c.get("text", "") for c in r.get("content", []) if c.get("type") == "text")
                try:
                    inner = json.loads(text)
                    screen_name = inner.get("name") or inner.get("sourceScreen") or ""
                except Exception: pass
            print(f"✓ {screen_name.split('/')[-1] if screen_name else 'no name'}")
            # Drop any earlier failed entry with the same slug, then append.
            manifest = [x for x in manifest if x.get("slug") != slug]
            manifest.append({**s, "screenName": screen_name, "structuredContent": sc})
        except Exception as e:
            print(f"✗ {e}")
            manifest = [x for x in manifest if x.get("slug") != slug]
            manifest.append({**s, "error": str(e)})
        mf_path.write_text(json.dumps(manifest, indent=2))
    return manifest


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--only", choices=["dash", "ota", "serial", "net"])
    args = p.parse_args()
    m = generate(args.only)
    ok = sum(1 for x in m if x.get("screenName"))
    print(f"\n{ok} / {len(m)} screens generated  →  ui/stitch-out/manifest.json")
