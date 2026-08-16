# VectiDash widget reference 🎛

Every widget type VectiDash ships, what it renders, and the exact string you
hand `setValue()`.

**All 50 `DashType` types — 49 widgets plus `Custom`, the raw-HTML escape
hatch — are in the box.** There is no paid tier, no locked card, and there
is not going to be one.

![The widget gallery tab, dark theme](screenshots/dash-widgets-dark.png)

- [How a card works](#-how-a-card-works)
- [Choosing a widget](#-choosing-a-widget)
- [Readouts (14)](#-readouts)
- [Meters (8)](#-meters)
- [Charts (5)](#-charts)
- [Controls (20)](#-controls)
- [Layout & escape hatch (3)](#-layout--escape-hatch)
- [Cross-cutting behaviour](#-cross-cutting-behaviour)

---

## 🧱 How a card works

```cpp
#include <VectiDash.h>
using vecti::DashCard;
using vecti::DashType;

// (type, id, label)
// (type, id, label, unit)
// (type, id, label, unit, min, max)
DashCard temp(DashType::Temperature, "tmp", "PCB temperature", "°C");
DashCard lim (DashType::Slider,      "lim", "Current limit",   "A", 6, 32);

void setup() {
  lim.setStep(1);
  lim.setTab("Controls");
  lim.setWidth(6);                                   // 12-column grid units
  lim.onChange([](const String &v){ setCurrentLimit(v.toInt()); });

  VectiDash.add(&temp);
  VectiDash.add(&lim);
  VectiDash.begin(&server, "admin", "vecti");
}

void loop() {
  temp.setValue(readTemp(), 1);                      // float, 1 decimal
  VectiDash.tick();
}
```

Cards must outlive `VectiDash` — declare them global or static.

### The one rule: **every value crosses the wire as a string**

`setValue()` has overloads for `int`, `unsigned`, `long`, `float`, `double`,
`bool`, `const char*` and `String`, but they all funnel into `setValueStr()`.
`bool` becomes `"1"` / `"0"`; floats take a digits argument (default 2).

Structured widgets — tables, charts, heatmaps — therefore take **JSON inside
that string**. Every one of those formats is documented below.

### Fields every card carries

| Setter | Wire field | Who reads it |
|---|---|---|
| `setLabel()` | `label` | card chrome (and `Header` / `Divider` bodies) |
| `setUnit()` | `unit` | the widgets marked "unit" below; also the placeholder for `input`, `textarea`, `password`, and the subtitle for `header` |
| `setColor(DashColor)` | `color` | card accent rail; `badge` and `button` take their tone from it |
| `setTab()` | `tab` | which tab the card lands on; unknown tab → first tab |
| `setWidth(1..12)` | `width` | grid span; `0` = auto (3 columns, or 12 for `chart`/`custom`) |
| `setHidden(bool)` | `hidden` | card is not rendered |
| `setRange(lo, hi)` | `min`, `max` | the meters and the bounded controls |
| `setStep(st)` | `step` | `slider`, `stepper`, `range`, `knob` — and doubles as `bar`'s threshold marker |
| `setOptions("A\|B\|C")` | `opts` | `dropdown`, `radio`, `checklist` — and the ECC level for `qrcode` |
| `setCustomHtml()` | `custom` | `custom` only |

`DashColor` values: `Default`, `Success`, `Warning`, `Danger`, `Info`, `Primary`.

### Where the code lives

Sixteen types are rendered inline in the dashboard shell
(`ui/apps/dash/src/App.svelte`) because they predate the widget registry. The
other 34 are one `.svelte` file each in `ui/shared/widgets/`, registered in
`index.js`. Three places must agree: the `DashType` enum, `typeName()` in
`VectiDash.cpp`, and the registry key. A type with no registry entry and no
inline branch renders as *"Unsupported widget — update the device UI"*, which is
a normal state during a staged rollout.

> **On the count.** Measured:
> `grep -c 'case DashType::' libraries/VectiDash/src/VectiDash.cpp` → **50**;
> the registry holds 34 keys and the shell renders 16 inline (34 + 16 = 50), so
> every enumerator renders. One of the 50 is `Custom`, the raw-HTML escape
> hatch rather than a widget proper — hence **49 widgets + `Custom`**.
> This document lists all 50.

---

## 🧭 Choosing a widget

| You want to… | Use | Not |
|---|---|---|
| show one number with a trend | `number` | `text` — no sparkline, no unit styling |
| show a firmware version, a MAC, a state name | `text` | `number` — it will not format a string well |
| show a coloured state word | `status` (auto-toned) or `badge` (you pick the tone) | `led` — that is for a binary |
| show a binary output's state | `led` | `switch` — that is a control |
| show 0–100 % of something | `progress` or `donut` | `gauge` if you need the raw value visible |
| show a value against its own scale | `gauge` (180°), `dial` (270°), `bar`, `level`, `thermo` | `progress` — it always reads as a percentage |
| show a signed value that can go negative | `bar`, `level`, `thermo` with `setRange(-x, y)` | `donut` / `progress` |
| show a compass heading | `compass` | `dial` — it clamps, compass wraps |
| show a value trending over time | `chart` (+ `chartPushXY`) or `sparkline` | pushing 50 `number` updates |
| show several signals on one axis | `multichart` (max 5 series) | four separate `chart` cards |
| show one signal against another | `scatter` | `chart` — it plots against x, but as a line |
| show buckets / per-hour totals | `histogram` | `chart` |
| show a matrix — cell temps, an RSSI survey | `heatmap` | a `table` of numbers |
| show a key/value diagnostics block | `table` | ten `text` cards |
| show recent events | `logview` | `text` with newlines |
| fire a one-shot action | `button` | |
| fire a **dangerous** one-shot action | `confirm` | `button` — one pocket-brush away |
| jog a motor / hold a deadman | `momentary` | two `button`s |
| toggle something on/off | `switch` | `button` |
| set a value in a range, coarsely | `slider` or `knob` | |
| set a value in a range, exactly | `stepper` | `slider` — you cannot hit 21.5 °C on a phone |
| set a low/high band | `range` | two `slider`s that can cross |
| pick one of N | `dropdown` (hidden) or `radio` (all visible) | `slider` over an index |
| pick several of N | `checklist` | N `switch` cards |
| enter a short string | `input` | |
| enter several lines | `textarea` | |
| enter a secret | `password` | `input` |
| enter a PIN or a setpoint by digits | `keypad` | `input` on a phone |
| steer something that self-centres | `joystick` | `xypad` |
| set an absolute 2D position | `xypad` | `joystick` — it springs back |
| pick a colour | `color` | |
| set a date/time | `datetime` | |
| let a phone scan something | `qrcode` | |
| group a long tab | `header`, `divider` | |
| render something nothing else covers | `custom` | forking the UI |

---

## 📖 Readouts

Fourteen types. None of them send anything back.

### 🔢 `number` · `DashType::Number`

Large numeric KPI with the unit as a small grey suffix, plus an automatic
sparkline of the last 32 numeric values the browser has seen.

- **Value** — any numeric string. Empty renders as `—`.
- **Honours** — `unit`. The trend line is built client-side; `min`/`max` are not used.
- **Sends back** — no.

```cpp
DashCard pwr(DashType::Number, "pwr", "Power output", "kW");
pwr.setValue(7.24f, 2);        // "7.24"
```

The sparkline hides itself on cards narrower than 150 px (container query) —
the number always wins the space fight, because a truncated reading is useless
and a missing trend line is merely a shame.

### 🌡 `temperature` · `DashType::Temperature`

Identical rendering to `number`; the distinct type lets the shell pick a
thermometer icon and a warning tone from the card id, and it documents intent.

```cpp
DashCard t(DashType::Temperature, "tmp", "PCB temperature", "°C");
t.setValue(38.4f, 1);
```

### 💧 `humidity` · `DashType::Humidity`

Same as `number`, with the droplet decoration.

```cpp
DashCard h(DashType::Humidity, "hum", "Cabinet humidity", "%");
h.setValue(42.0f, 1);
```

### 🔤 `text` · `DashType::Text`

Plain string readout. Truncates rather than reflowing the card, and keeps the
full text in `title` so it stays recoverable on hover.

- **Value** — any string. Empty or unset renders `—`.
- **Honours** — `unit` (rendered after the text).
- **Sends back** — no.

```cpp
DashCard fw(DashType::Text, "fw", "Build");
fw.setValue("1.4.2+g8c1f2e");
```

### 🚦 `status` · `DashType::Status`

Status dot plus text, with the tone inferred from the string itself:

| Value starts with / contains | Tone |
|---|---|
| `ok`, `online`, `connect`, `valid`, `success`, `live`, `good`, `ready` (prefix) | ok |
| contains `warn`, `degrad`, `pending` | warn |
| contains `err`, `off`, `fail`, `invalid`, `fault`, `alarm` | error |
| anything else | muted |

- **Sends back** — no.

```cpp
DashCard st(DashType::Status, "st", "Charger state");
st.setValue(charging ? "Charging" : "Fault: contactor");
```

If you want to choose the tone yourself instead of having it inferred, use
`badge`.

### 🏷 `badge` · `DashType::Badge`

Status pill whose colour comes from `setColor()`, so a badge and its card's
accent rail never disagree. The text carries the meaning; the colour only
repeats it.

- **Value** — any string; empty renders `—`.
- **Honours** — `color`, `unit`.
- **Sends back** — no.

```cpp
DashCard mode(DashType::Badge, "md", "Mode");
mode.setColor(vecti::DashColor::Info);
mode.setValue("Boost");
```

### 💡 `led` · `DashType::Led`

Indicator lamp with the word **ON** / **OFF** / **BLINK** beside it — a panel of
eight LEDs read only by hue is unusable for a technician with a red-green
deficiency, and unreadable in sunlight for everyone.

- **Value** — `"1"`, `"true"`, `"on"` → on. `"blink"` → blinking. Anything else → off. Case-insensitive, whitespace-trimmed.
- **Honours** — `unit`.
- **Sends back** — no.

```cpp
DashCard k(DashType::Led, "k1", "Contactor");
k.setValue(digitalRead(RELAY));        // bool → "1"/"0"
k.setValue("blink");                   // fault indication
```

### 🔋 `battery` · `DashType::Battery`

Battery symbol with a fill, a percentage, and the word **low** spelled out below
20 %.

- **Value** — a number on the card's own scale. A trailing `+` means charging (`"87+"`).
- **Honours** — `min`, `max`, `unit`. `setUnit("charging")` also forces the charging state.
- **Sends back** — no.

```cpp
DashCard b(DashType::Battery, "bat", "Pack", "%", 0, 100);
b.setValue(String(soc) + (charging ? "+" : ""));
```

### 📶 `signal` · `DashType::Signal`

RSSI bars **with the dBm number always printed next to them** — bars alone are a
lie by rounding: −55 and −30 dBm draw the same four bars and behave nothing
alike.

- **Value** — RSSI in dBm (negative). Non-numeric → zero bars.
- **Thresholds** — ≥ −55: 4 bars · ≥ −65: 3 · ≥ −75: 2 · ≥ −85: 1 · below: 0.
- **Sends back** — no.

```cpp
DashCard s(DashType::Signal, "rssi", "Wi-Fi", "dBm");
s.setValue(WiFi.RSSI());
```

### ⏱ `uptime` · `DashType::Uptime`

Seconds rendered as two units — `12d 04h`, `3h 07m`. The second unit is
zero-padded so the string keeps its width as it ticks.

- **Value** — uptime in **seconds**. Negative or non-numeric renders nothing.
- **Sends back** — no.

```cpp
DashCard up(DashType::Uptime, "up", "Uptime");
up.setValue((uint32_t)(millis() / 1000));
```

### 📋 `table` · `DashType::Table`

Key/value diagnostics table that scrolls inside the card instead of stretching
it. The card every competing dashboard makes you fake with a dozen one-line
text cards.

- **Value**, preferred — JSON `[["Key","Val"],["Key","Val"]]`
- **Value**, cheap alternative — `"k=v;k=v"` (much cheaper to build with `String` concatenation on the device)
- **Sends back** — no.

```cpp
DashCard tbl(DashType::Table, "dev", "Device");
tbl.setValue("[[\"Chip\",\"ESP32-S3\"],[\"Flash\",\"8 MB\"],[\"PSRAM\",\"2 MB\"]]");

// or, without building JSON:
tbl.setValue("Chip=ESP32-S3;Flash=8 MB;PSRAM=2 MB");
```

A malformed JSON payload falls through to the `k=v;` parser rather than
throwing — a half-sent frame from a rebooting device is normal here.

### 📜 `logview` · `DashType::LogView`

Rolling log pane, newest at the bottom. It follows the tail **only while the
reader is already at the bottom** — auto-scrolling someone who scrolled up to
read the line that broke is the classic log-widget sin.

- **Value** — JSON `["line","line"]`, or a newline-separated string.
- **Sends back** — no.

```cpp
DashCard lg(DashType::LogView, "ev", "Events");
lg.setValue("[\"boot ok\",\"wifi up\",\"dash ready\"]");
lg.setValue("boot ok\nwifi up\ndash ready");     // equivalent
```

For a real console with levels, search and history, use **VectiSerial** instead.

### 🖼 `image` · `DashType::Image`

- **Value** — an `http://`/`https://`/`data:` URL, **or** a bare base64 string, which is wrapped as `data:image/png;base64,<value>`.
- **Honours** — `label` becomes the `alt` text.
- **Sends back** — no.

```cpp
DashCard img(DashType::Image, "cam", "Snapshot");
img.setValue("https://example.com/cam/latest.jpg");
```

An external URL only loads if the browser can reach it — often not the case on a
phone joined to the device's own AP. A `data:` URL always works.

### 📈 `sparkline` · `DashType::Sparkline`

A trend line with the latest reading printed beside it. A trend with no number
tells you something changed but not what it is now, which is the half of the
question that matters.

- **Value** — JSON `[1,2,3]` or the comma form `"1,2,3"`.
- **Honours** — `unit`.
- **Sends back** — no.

```cpp
DashCard sp(DashType::Sparkline, "trend", "Load", "%");
sp.setValue("[12,14,19,17,22,25,24]");
```

The displayed number is rounded to 2 decimals; the line uses full precision.

---

## 🎚 Meters

Eight types. All read-only, all scaled to the card's own `min`/`max`.

### ⏲ `gauge` · `DashType::Gauge`

180° arc with the reading below it (below, not inside — centred in the arc it
collided with the 8 px stroke on any card narrower than ~200 px).

- **Value** — a number.
- **Honours** — `min`, `max`, `unit`. Displayed to 1 decimal.
- **Sends back** — no.

```cpp
DashCard g(DashType::Gauge, "cg", "Charge power", "kW", 0, 22);
g.setValue(7.2f, 1);
```

### 🕐 `dial` · `DashType::Dial`

Full 270° instrument dial with a needle and a big centre number. Same range
spread over half again as much arc as `gauge`, so a technician reads it to the
division instead of guessing.

- **Value** — a number. Clamps at both ends.
- **Honours** — `min`, `max`, `unit`.
- **Sends back** — no.

```cpp
DashCard d(DashType::Dial, "dl", "Output", "kW", 0, 22);
d.setValue(7.2f, 1);
```

### 🍩 `donut` · `DashType::Donut`

Ring showing the value as a percentage of its range, with the percentage in the
middle.

- **Value** — a number; converted to a percentage of `min`..`max` and clamped.
- **Honours** — `min`, `max`. The `%` sign is fixed; `unit` is not shown.
- **Sends back** — no.

```cpp
DashCard soc(DashType::Donut, "soc", "Battery SoC", "%", 0, 100);
soc.setValue(78);
```

### ▬ `progress` · `DashType::Progress`

Thin horizontal bar plus a footer line showing the raw value with its unit on
the left and the percentage on the right.

- **Value** — a number.
- **Honours** — `min`, `max`, `unit`.
- **Sends back** — no.

```cpp
DashCard q(DashType::Progress, "q", "Daily quota", "%", 0, 100);
q.setValue(64);
```

### 📊 `bar` · `DashType::Bar`

Horizontal magnitude bar with **real end labels** (not 0–100 %), and an optional
threshold tick.

- **Value** — a number.
- **Honours** — `min`, `max`, `unit`, and **`step` as a threshold marker** — but only when `min < step < max`, since `step` is also a slider increment and a step of 1 on a 0–1000 scale would plant a tick against the left edge.
- **Sends back** — no.

```cpp
DashCard b(DashType::Bar, "load", "Feeder load", "A", 0, 63);
b.setStep(50);                 // alarm threshold at 50 A
b.setValue(41.8f, 1);
```

When the value reaches the marker the card prints `threshold 50A · reached`.

### 🛢 `level` · `DashType::Level`

Vertical tank/level column with min and max end labels. Tone shifts at ≤ 25 %
(warn) and ≤ 10 % (error), and the number is always printed too, so a low tank
is readable without seeing the colour at all.

- **Value** — a number.
- **Honours** — `min`, `max`, `unit`.
- **Sends back** — no.

```cpp
DashCard lv(DashType::Level, "tank", "Coolant", "L", 0, 60);
lv.setValue(41);
```

### 🧭 `compass` · `DashType::Compass`

Heading dial that prints the cardinal name (`SE`) next to the degrees — a
pointer alone is unreadable to a screen reader, and "SE" is what anyone says out
loud.

- **Value** — degrees. **Wraps** rather than clamping: 370 is 10, and a gyro that free-runs past 360 is normal.
- **Sends back** — no.

```cpp
DashCard c(DashType::Compass, "hdg", "Heading");
c.setValue(137);
```

### 🌡 `thermo` · `DashType::Thermo`

Bulb-and-stem thermometer scaled to the card's range — the shape you can read
across a workshop without focusing on the digits.

- **Value** — a number.
- **Honours** — `min`, `max`, `unit` (both end labels carry the unit).
- **Sends back** — no.

```cpp
DashCard th(DashType::Thermo, "cool", "Coolant", "C", -10, 90);
th.setValue(64.2f, 1);
```

---

## 📉 Charts

Five types. All read-only. All parse JSON out of the value string, and all fall
back to an empty chart on a malformed payload rather than throwing out of the
grid — a half-sent frame from a rebooting device is expected, not exceptional.

### 📈 `chart` · `DashType::Chart`

Line/area chart with a gradient fill. Defaults to full width (12 columns).

- **Value** — `{"x":[…],"y":[…]}`. Needs at least 2 y-points to draw.
- **Build it with the helpers** — `chartPushXY()` / `chartSetSeries()` encode this for you.
- **Honours** — `chartType` is carried in the layout frame for custom front-ends; the bundled UI draws the same gradient area+line for all three.
- **Sends back** — no.

```cpp
DashCard tr(DashType::Chart, "tr", "Power over time");
tr.setWidth(12);
tr.chartSetMaxPoints(120);              // default is 50

void loop() {
  tr.chartPushXY(millis() / 1000.0f, readPower());
  VectiDash.tick();
}
```

The x series is honoured, so an irregular sample cadence draws with the right
spacing — there is no need to push at a fixed interval.

Pushing beyond `chartSetMaxPoints()` drops from the front. `chartSetSeries()`
keeps the **newest** `maxPoints` samples, so handing over a longer series means
the same thing as pushing them one at a time.

### 📉 `multichart` · `DashType::MultiChart`

Multi-series line chart on one shared y-scale. Series differ by **dash pattern
as well as colour**, so colour-blind readers and greyscale printouts get the
same chart; the legend carries the pattern too.

- **Value** — `{"x":[…],"s":[{"n":"L1","y":[…]},{"n":"L2","y":[…]}]}`
- **Limits** — max **5** series; extras are dropped rather than drawn in colours nobody can distinguish. `x` is used only when its length matches the longest `y`.
- **Gaps** — a non-finite sample lifts the pen instead of drawing a straight line across the hole.
- **Sends back** — no.

```cpp
DashCard mc(DashType::MultiChart, "ph", "3-phase current");
mc.setWidth(12);

String j = "{\"x\":[0,1,2],\"s\":["
           "{\"n\":\"L1\",\"y\":[12.1,12.4,12.2]},"
           "{\"n\":\"L2\",\"y\":[11.8,12.0,11.9]},"
           "{\"n\":\"L3\",\"y\":[12.5,12.3,12.6]}]}";
mc.setValue(j);
```

### 📊 `histogram` · `DashType::Histogram`

Labelled vertical bars from a bucket set. The baseline sits at zero when the
data is all-positive, so a "0" bucket does not look like the smallest one.

- **Value** — `{"l":["a","b"],"v":[1,2]}`. `l` is optional — missing labels become the 1-based index.
- **Limits** — first **24** buckets.
- **Sends back** — no.

```cpp
DashCard hs(DashType::Histogram, "hh", "Hourly kWh");
hs.setValue("{\"l\":[\"00\",\"01\",\"02\"],\"v\":[1.2,0.8,2.4]}");
```

### ⚬ `scatter` · `DashType::Scatter`

XY point plot with auto-scaled axes — how you see one signal against another
(current vs RPM, temperature vs duty).

- **Value** — `{"x":[…],"y":[…]}`. Pairs are taken up to `min(len(x), len(y))`; non-finite pairs are skipped.
- **Limits** — first **400** points.
- **Sends back** — no.

```cpp
DashCard sc(DashType::Scatter, "vi", "V vs I");
sc.setValue("{\"x\":[228,229,231],\"y\":[31.4,31.1,30.8]}");
```

### 🔥 `heatmap` · `DashType::Heatmap`

Row-major matrix as a colour-scaled grid — thermal camera frames, RSSI surveys,
per-channel duty. The legend carries numbers, because a colour ramp with no
scale is unreadable on a phone nobody can hover.

- **Value** — `{"w":8,"v":[…]}` — `w` is the row width, `v` is row-major.
- **Limits** — `w` ≤ **64**, and the first **2048** cells only. (The cell *count* is capped, not just the width: `w ≤ 64` still admits a 64×500 payload, and 32,000 spans is a locked-up tab.)
- **Honours** — `unit` on the legend and on every cell's tooltip.
- **Scale** — min/max over the finite cells only, so one NaN from a disconnected probe does not collapse the ramp.
- **Sends back** — no.

```cpp
DashCard hm(DashType::Heatmap, "cells", "Cell temps", "°C");
hm.setValue("{\"w\":4,\"v\":[31,32,33,31, 30,34,35,32, 31,33,34,33]}");
```

---

## 🎮 Controls

Twenty types. Each one calls your `onChange` callback — **on the `loop()`
task**, from inside `tick()`, with the payload exactly as documented.

```cpp
card.onChange([](const String &payload){ /* runs on loop(), not AsyncTCP */ });
```

A slow callback delays your own loop rather than stalling the server — but it
still delays it, so no `delay()` longer than your push interval.

The device does **not** echo the command back. Your callback may clamp or reject
the value; the next `upd` frame carries whatever the firmware actually settled
on. Widgets with a drag interaction (slider, knob, xypad) hold a local value
while dragging and drop it when the echo lands.

### 🔘 `button` · `DashType::Button`

Single-tap action. Renders in the card's semantic colour — a card declared
`DashColor::Danger` (an E-STOP) must not look like every benign action.

- **Displays** — `label`.
- **Sends** — `"1"` on click.
- **Value** — not rendered.

```cpp
DashCard stop(DashType::Button, "estop", "Emergency STOP");
stop.setColor(vecti::DashColor::Danger);
stop.onChange([](const String &){ tripContactor(); });
```

### ⚠️ `confirm` · `DashType::ConfirmButton`

Two-stage button for actions that cannot be undone. First tap arms it and shows
a **3-second** countdown; the second tap inside that window fires; otherwise it
disarms itself.

- **Sends** — `"1"` on the second tap only.
- **Honours** — `color`.

```cpp
DashCard fr(DashType::ConfirmButton, "fr", "Factory reset");
fr.setColor(vecti::DashColor::Danger);
fr.onChange([](const String &){ VectiNet.clearAllCredentials(); });
```

### 🖲 `momentary` · `DashType::Momentary`

Press-and-**hold**: `1` while held, `0` the instant it is released. The jog /
deadman control.

- **Sends** — `"1"` on press, `"0"` on release.
- **Safety** — it takes pointer capture, so a finger sliding off the button still delivers the release. Release is idempotent and also fires on blur, Escape and unmount: a card removed mid-hold cannot leave the output energised.

```cpp
DashCard jog(DashType::Momentary, "jog", "Jog motor");
jog.onChange([](const String &v){ digitalWrite(MOTOR, v == "1"); });
```

### 🔀 `switch` · `DashType::Switch`

Toggle.

- **Value** — `"1"` or `"true"` reads as on; anything else off.
- **Sends** — `"1"` / `"0"`.

```cpp
DashCard sw(DashType::Switch, "start", "Start session");
sw.onChange([](const String &v){ setSession(v == "1"); });
sw.setValue(sessionActive);      // bool → "1"/"0"
```

### 🎚 `slider` · `DashType::Slider`

Range input with min, current and max printed above it.

- **Value** — a number.
- **Honours** — `min`, `max`, `step` (a step of 0 falls back to 1), `unit`.
- **Sends** — the numeric string, **on every input event** while dragging.

```cpp
DashCard lim(DashType::Slider, "lim", "Current limit", "A", 6, 32);
lim.setStep(1);
lim.onChange([](const String &v){ setLimit(v.toInt()); });
```

Because it fires per input event, keep the callback cheap. `tick()`'s rate limit
(default 100 ms) bounds how often the queue is drained, and the queue is
last-write-wins.

### ↔️ `range` · `DashType::RangeSlider`

Dual-handle band — an alarm window, a dead band, a legal operating range.

- **Value** — `"lo,hi"`. Anything else (empty, one number, junk) falls back to the full range. An inverted `"80,20"` is drawn correctly, not as an inverted track.
- **Honours** — `min`, `max`, `step`, `unit`.
- **Sends** — `"lo,hi"`.

```cpp
DashCard win(DashType::RangeSlider, "win", "Alarm window", "C", 0, 60);
win.setValue("18,42");
win.onChange([](const String &v){
  int comma = v.indexOf(',');
  float lo = v.substring(0, comma).toFloat();
  float hi = v.substring(comma + 1).toFloat();
  setAlarmWindow(lo, hi);
});
```

### ➕ `stepper` · `DashType::Stepper`

Numeric entry with − / + buttons and a typed field. The setpoint control: a
slider cannot hit 21.5 °C on a phone, and a bare text box gives no range at all.

- **Value** — a number.
- **Honours** — `min`, `max`, `step`, `unit` (the unit row also prints the range).
- **Sends** — the numeric string, rounded to the step's own decimal precision (so `0.1 + 0.2` does not go out as `0.30000000000000004`).
- **Behaviour** — press-and-hold repeats after a 420 ms kick-off, then every 90 ms. A typed value is snapped back into range.

```cpp
DashCard sp(DashType::Stepper, "sp", "Setpoint", "A", 6, 32);
sp.setStep(0.5f);
sp.setValue(16);
sp.onChange([](const String &v){ setSetpoint(v.toFloat()); });
```

### ▼ `dropdown` · `DashType::Dropdown`

Select from firmware-supplied options.

- **Options** — `setOptions("Eco|Standard|Boost")`.
- **Value** — the selected option string (must match one of the options to show as selected).
- **Sends** — the selected option string.

```cpp
DashCard pf(DashType::Dropdown, "prof", "Profile");
pf.setOptions("Eco|Standard|Boost");
pf.setValue("Standard");
pf.onChange([](const String &v){ applyProfile(v); });
```

### ⦿ `radio` · `DashType::Radio`

Single choice as a segmented control — a mode selector on an instrument panel
should show every mode it has, not hide them behind a tap.

- **Options / value / sends** — same as `dropdown`.

```cpp
DashCard ph(DashType::Radio, "ph", "Phase");
ph.setOptions("L1|L2|L3");
ph.setValue("L1");
```

### ☑️ `checklist` · `DashType::Checklist`

Multi-select over the same option list — enabled channels, armed alarms, which
pumps take part in a cycle.

- **Options** — `setOptions("OCPP|MQTT|Modbus")`.
- **Value** — the selected subset, `|`-separated: `"OCPP|MQTT"`.
- **Sends** — the new subset, **emitted in option order, not click order**, so an unchanged selection never looks like a change.

```cpp
DashCard proto(DashType::Checklist, "pr", "Protocols");
proto.setOptions("OCPP|MQTT|Modbus");
proto.setValue("OCPP|MQTT");
proto.onChange([](const String &v){ enableProtocols(v); });
```

### ⌨️ `input` · `DashType::Input`

Single-line text field.

- **Value** — the current string.
- **Honours** — `unit` as the placeholder (falls back to `"type and press enter"`).
- **Sends** — the field contents on `change` (blur or Enter), not per keystroke.

```cpp
DashCard tag(DashType::Input, "tag", "Driver RFID tag");
tag.onChange([](const String &v){ authorizeTag(v); });
```

### 📝 `textarea` · `DashType::Textarea`

Multi-line text.

- **Value** — the current string; re-seeded only when the device sends something the widget has not seen, so an unrelated re-render never wipes half-typed text.
- **Honours** — `unit` as the placeholder.
- **Sends** — on blur and on Ctrl/⌘+Enter, never per keystroke — every keystroke would be a WebSocket frame to a device that is also running a control loop.

```cpp
DashCard notes(DashType::Textarea, "notes", "Site notes");
notes.setValue("Bay 3, ground floor.\nWest pillar.");
notes.onChange([](const String &v){ saveNotes(v); });
```

### 🔑 `password` · `DashType::Password`

Masked field with a show/hide toggle. The value appears in exactly one place —
the input — and nowhere in a label, title or console.

- **Value** — the current string.
- **Honours** — `unit` as the placeholder.
- **Sends** — on blur and Enter, so a half-typed secret never goes on the wire.

```cpp
DashCard pw(DashType::Password, "mqtt_pw", "MQTT password");
pw.onChange([](const String &v){ setBrokerPassword(v); });
```

> Note the difference from VectiNet's `Password` parameter type, which never
> hands the stored value back to the browser at all. A VectiDash `password` card
> renders whatever the firmware puts in `value`. If the secret must not leave the
> device, do not `setValue()` it.

### 🔢 `keypad` · `DashType::Keypad`

Numeric pad that buffers locally and sends once. A PIN or a setpoint is typed a
digit at a time and only the finished string is worth a frame.

- **Buffer** — max 16 characters. Backspace, clear, and a physical keyboard (digits, Backspace, Escape) all work.
- **Sends** — the buffered string on enter, then clears. Never sends an empty buffer.

```cpp
DashCard pin(DashType::Keypad, "pin", "PIN");
pin.onChange([](const String &v){ if (checkPin(v)) unlock(); });
```

### 🕹 `joystick` · `DashType::Joystick`

Self-centring 2-axis pad, magnitude-clamped to the unit circle.

- **Sends** — `"x,y"` with each component an integer **−100..100**. **y is inverted** — up is positive. Sends `"0,0"` on release.
- **Value** — not rendered.

```cpp
DashCard joy(DashType::Joystick, "joy", "Camera pan / tilt");
joy.onChange([](const String &v){
  int comma = v.indexOf(',');
  int x = v.substring(0, comma).toInt();     // -100..100
  int y = v.substring(comma + 1).toInt();    // -100..100, up positive
  drivePanTilt(x, y);
});
```

### ✛ `xypad` · `DashType::XYPad`

Absolute 2D pad. Unlike the joystick it does **not** self-centre — the dot stays
where it is put, which is what a pan/tilt head or an XY setpoint actually wants.

- **Value** — `"x,y"`, integers **0..100**, y measured **bottom-up**. Malformed → dead centre (`50,50`), never a throw.
- **Sends** — `"x,y"`, one frame per integer step rather than per pixel. Arrow keys nudge by 1, Shift+arrow by 10.

```cpp
DashCard xy(DashType::XYPad, "aim", "Pan / tilt");
xy.setValue("50,50");
xy.onChange([](const String &v){ aim(v); });
```

### 🎛 `knob` · `DashType::Knob`

Rotary control with a 270° sweep. Drag vertically for fine work (full range over
~170 px), or grab the rim and sweep an arc. Arrow keys nudge by `step`,
Shift+arrow by 10 steps, Home/End jump to the ends. The number is always in the
centre, so the pointer angle is decoration, not the readout.

- **Value** — a number.
- **Honours** — `min`, `max`, `step`, `unit`.
- **Sends** — the numeric string, snapped to `step` and clamped.

```cpp
DashCard kn(DashType::Knob, "kn", "Limit", "A", 6, 32);
kn.setStep(1);
kn.setValue(16);
kn.onChange([](const String &v){ setLimit(v.toInt()); });
```

### 🎨 `color` · `DashType::Color`

Native colour picker with the hex printed beside it.

- **Value** — `#rrggbb` (validated by regex; anything else falls back to a default swatch).
- **Sends** — `#rrggbb` on input.

```cpp
DashCard led(DashType::Color, "led", "LED ring colour");
led.setValue("#0fd08c");
led.onChange([](const String &v){
  VectiDash.setBrandColor(v);
  VectiDash.refreshLayout();
});
```

### 📅 `datetime` · `DashType::DateTime`

Native `datetime-local` field.

- **Value** — Unix epoch **seconds** (the device's `time_t`). Unparseable → blank field, not 1970.
- **Sends** — Unix epoch seconds.

```cpp
DashCard svc(DashType::DateTime, "svc", "Next service");
svc.setValue((long)nextServiceEpoch);
svc.onChange([](const String &v){ nextServiceEpoch = strtoul(v.c_str(), nullptr, 10); });
```

> ⏰ **Timezone footgun.** `<input type="datetime-local">` is a naive wall clock
> with no zone, so the conversion uses the **browser's** local zone in both
> directions. That is correct only when the device's clock is also on the
> technician's local time — the usual case for an ESP32 with a `configTime()`
> offset, and wrong for one left on UTC, which will read off by the browser's
> offset. Nothing in the payload disambiguates it. If your sketch works in UTC,
> say so in the card label.

### 🔳 `qrcode` · `DashType::QrCode`

Scannable QR code, encoded on the device page — no external service, no network
round trip.

- **Value** — the payload string, verbatim.
- **Options** — `setOptions()` doubles as the ECC level: `"L"`, `"M"` (default), `"Q"`, `"H"`. L saves a version on long URLs; H survives a scuffed sticker.
- **Sends back** — no. (It is in Controls because it is an interaction surface, not a readout.)

```cpp
DashCard qr(DashType::QrCode, "join", "Join this AP");
qr.setValue("WIFI:S:Vecti-Demo;T:nopass;;");   // a tech scans it to join
// or point a phone straight at the dashboard:
qr.setValue("http://192.168.4.1/dash");
```

A `WIFI:` payload is recognised and the accessible label names the network
rather than reading the raw blob out loud. The full payload is printed under the
symbol either way.

---

## 🧩 Layout & escape hatch

`header` and `divider` are **bare** — they get no card chrome at all, no border
and no label row, because they exist to organise the grid rather than sit in it.

### 🔠 `header` · `DashType::Header`

A section heading dropped into the card grid. Deliberately understated —
anything eye-catching here would compete with the instruments it labels.

- **Displays** — `label` as the heading, `unit` as an optional subtitle.
- **Value / sends back** — neither.

```cpp
DashCard h(DashType::Header, "h1", "Meters");
h.setUnit("live, 1 Hz");
h.setWidth(12);
```

### ➖ `divider` · `DashType::Divider`

A horizontal rule across the card grid, with `label` as an optional centred
caption.

```cpp
DashCard dv(DashType::Divider, "dv", "end of catalogue");
dv.setWidth(12);
```

### 🧪 `custom` · `DashType::Custom`

The escape hatch: your own HTML snippet, rendered inside the card body. Neither
tier of the comparable commercial dashboards ships one.

- **Markup** — `setCustomHtml("<div>…</div>")`, sent in the layout frame.
- **Live value** — put a `<span id="dash-<cardId>-out"></span>` in the snippet. The runtime writes `setValue()` into it via `textContent` on every broadcast.
- **Width** — defaults to 12 columns.

```cpp
DashCard hero(DashType::Custom, "hero", "Status");
hero.setWidth(12);
hero.setCustomHtml(
  "<div style='display:flex;align-items:center;gap:16px'>"
    "<div style='font-size:28px'>⚡</div>"
    "<div style='font-size:22px;font-weight:800'>"
      "<span id='dash-hero-out'>—</span></div>"
  "</div>");

void loop() {
  hero.setValue(String("Charging · ") + String(power, 2) + " kW");
  VectiDash.tick();
}
```

Two boundaries to be aware of:

- **The snippet is injected as markup**, so a `<script>` inside it never
  executes. Everything beyond the output span is inert decoration.
- **The value goes in as text, never as HTML.** The snippet is firmware-authored,
  but the *value* routinely carries live sensor readings, and those must never be
  parsed as markup. That said: a sketch that interpolates untrusted input into
  the **snippet** is injecting into this page. Build the snippet from constants.

---

## 🔎 Cross-cutting behaviour

### Grid width

`setWidth(1..12)` sets the desktop span. `0` (the default) means 3 columns —
except `chart` and `custom`, which default to 12.

The shell reflows by viewport:

| Viewport | Rule |
|---|---|
| ≤ 448 px (`small`) | wide cards and 12-wide cards stay 12; everything else becomes 6 |
| ≤ 800 px (`tablet`) | wide cards and anything wider than 3 become 12; everything else 6 |
| desktop | your declared width |

Tablet snaps to halves or full rather than doubling, because doubling turned a
4-wide card into an 8 and left a 4-column gap on every row.

### Automatic icons and tones

The shell decorates a card from its **id**, when you have not set a colour
explicitly. Anchored patterns, so `up` does not match `supply`:

| id pattern | tone | icon |
|---|---|---|
| starts `pwr`/`power`, or ends `kw` | info | Zap |
| starts `kwh`/`energy` | success | BatteryCharging |
| starts `cost`/`price` | primary | IndianRupee |
| exactly `sess`/`time`/`up`/`uptime` | — | Clock |
| starts `tmp`/`temp` | warning | Thermometer |
| starts `hum` | info | Droplets |
| starts `rssi`/`net`/`wifi` | — | Wifi |
| starts `heap`/`mem` | — | Cpu |
| starts `v<digit>`/`volt` | info | Zap |
| starts `i<digit>`/`cur`/`amp` | warning | Bolt |
| exactly `f`, or starts `freq` | — | Activity |
| starts `cpu`/`load` | — | Gauge |

An explicit `setColor()` always wins.

### Tabs

```cpp
VectiDash.addTab("Overview");
VectiDash.addTab("Controls");
card.setTab("Controls");
```

A card whose `tab` is unset — or names a tab that was never registered — lands on
the **first** tab rather than vanishing onto a phantom page. The current tab is
mirrored into the URL hash, so `http://device/dash#Controls` deep-links.

On phones (≤ 448 px) the tab strip becomes a hamburger drawer.

### Notifications

Not a widget, but the other thing firmware can push:

```cpp
VectiDash.notify(vecti::NotifyLevel::Success, "Session started");
VectiDash.notify(vecti::NotifyLevel::Warn, "Rebooting in 1s…", 1000);   // ttl ms
```

Levels: `Info`, `Success`, `Warn`, `Error`. Default TTL 5000 ms.

### Unknown types

A card whose `type` the embedded page does not know renders as
*"Unsupported widget `<type>` — update the device UI."* Firmware newer than the
embedded page is a normal state during a staged rollout, so the UI says so
rather than showing an empty box the operator cannot interpret.

### Adding a widget of your own

See `ui/shared/widgets/CONTRACT.md`. The short version: one `.svelte` file taking
`{ card, value, cmd }`, registered in `index.js` under the lowercase key that
`typeName()` emits, then `npm run build` in `ui/` to regenerate the PROGMEM blob.
Keep the enum, `typeName()` and the registry key in sync.

---

## See also

- [ARCHITECTURE.md](ARCHITECTURE.md) — threading, memory, the build pipeline.
- [WIRE-PROTOCOL.md](WIRE-PROTOCOL.md) — the `layout` / `upd` / `cmd` frames these cards ride on.
- `libraries/VectiDash/examples/WidgetGallery/WidgetGallery.ino` — 16 types, runnable.
- `demo/src/main.cpp` — 49 of the 50 on a Widgets tab; only `DashType::Image` is absent.

---

<sub>**Author:** VectiVolt · team@vectivolt.com · (c) 2026 VectiVolt — Apache-2.0</sub>
