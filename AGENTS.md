# AGENTS.md — VectiSuite

Instructions for AI coding agents writing ESP32 firmware against the four
libraries in this repo. Read this before you write a sketch. The deep reference
— every method signature, every endpoint, all 50 `DashType` types (49 widgets
plus `Custom`, the raw-HTML escape hatch), wrong→right code pairs — is [`docs/AI-AGENT-GUIDE.md`](docs/AI-AGENT-GUIDE.md).

If you only remember three things:

1. **`loop()` is not optional.** Every library has a per-loop hook with a
   different name. Skip it and the library silently does nothing.
2. **Never block in a callback.** Callbacks that fire on the AsyncTCP task must
   set a flag; `loop()` does the work. `delay()` / `ESP.restart()` there breaks
   every other connection on the device.
3. **Everything on the VectiDash wire is a string.** `setValue(0)` sends `"0"`.

---

## 📦 What the four libraries are

| Library | Job | Routes it mounts | Loop hook | Platform |
|---|---|---|---|---|
| **VectiOTA** | Firmware + filesystem OTA — browser drag-drop, pull-from-URL, HMAC signing, A/B rollback | `/ota` `/ota/info` `/ota/upload` `/ota/pull` `/ota/events` `/ota/commit` `/ota/rollback` | `VectiOTA.loop()` | ESP32, ESP8266 |
| **VectiSerial** | Wireless console over WebSocket — 4 log levels, history replay, command input | `/serial` `/serial/ws` | `VectiSerial.loop()` | ESP32 |
| **VectiNet** | Wi-Fi provisioning — captive portal, up to 8 saved SSIDs, custom parameters in NVS | `/wifi` `/wifi/scan` `/wifi/connect` `/wifi/status` `/wifi/params` `/wifi/reset` `/wifi/restart` `/generate_204` `/gen_204` `/hotspot-detect.html` `/ncsi.txt` | `VectiNet.loop()` | ESP32 only (`#error` otherwise) |
| **VectiDash** | Realtime dashboard, 49 widgets + `Custom`, single WebSocket | `/` (302 → `/dash`) `/dash` `/dash/login` `/dash/ws` | `VectiDash.tick()` | ESP32 |

All four mount onto **one** `AsyncWebServer` you own. C++ namespace is
`vecti::`; the globals `VectiOTA` / `VectiSerial` / `VectiNet` / `VectiDash` are
already declared by the headers — do not instantiate your own.

---

## 🧩 The shape of every sketch

```cpp
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <VectiOTA.h>
#include <VectiSerial.h>
#include <VectiNet.h>
#include <VectiDash.h>

AsyncWebServer server(80);                       // ONE server, port 80

vecti::DashCard temp(vecti::DashType::Number, "temp", "Temperature", "°C");

float readTemp() { return 20.0f + (millis() % 20) * 0.1f; }   // your sensor here

void setup() {
  Serial.begin(115200);

  VectiNet.setApCredentials("MyProduct-Setup");
  VectiNet.addParameter({"mqtt_h","MQTT host", vecti::NetParamType::Text,
                         "broker.local","fqdn or ip","",0,0});   // BEFORE begin()
  VectiNet.begin(&server);

  VectiSerial.begin(&server, "admin", "vecti");

  VectiOTA.setFWVersion("1.0.0");
  VectiOTA.begin(&server, "admin", "vecti");

  VectiDash.add(&temp);
  VectiDash.begin(&server, "admin", "vecti");

  server.begin();                                // AFTER every library begin()
  VectiNet.autoConnect();
  VectiOTA.commit();                             // "this image booted fine"
}

void loop() {
  VectiNet.loop();
  VectiSerial.loop();
  VectiOTA.loop();
  temp.setValue(readTemp());                     // sketch owns card values
  VectiDash.tick();
}
```

That is the whole integration surface. Everything else is configuration.

---

## ⚠️ The one gotcha per library

**VectiOTA** — `VectiOTA.loop()` executes the *deferred reboot* after a
successful flash, the rollback watchdog, and pull-mode downloads. Without it an
upload finishes and the device never reboots into the new image. Also: if you
call `setRollbackTimeoutMs(ms)`, you **must** call `VectiOTA.commit()` from
`setup()` after your self-test, or the bootloader reverts.

**VectiSerial** — `onMessage()` runs on the **AsyncTCP task**. `ESP.restart()`,
`delay()` or an NVS write there tears down the stack from inside its own
callback. Set a `volatile bool` and act in `loop()`. Logging from the callback
*is* safe (it only appends to a ring).

**VectiNet** — `addParameter()` must be called **before** `begin()`; parameters
added afterwards never reach the portal form. ESP32 only — the header
`#error`s on any other target.

**VectiDash** — charts do **not** take `setValue()`. Use
`card.chartPushXY(x, y)` (or `chartSetSeries`); `setValue()` on a chart card
overwrites the encoded series with junk the renderer will drop.

---

## 🔢 Version floor (get this wrong and nothing compiles)

```ini
lib_deps =
    ESP32Async/ESPAsyncWebServer @ ^3.11.0
    ESP32Async/AsyncTCP          @ ^3.4.0
    bblanchon/ArduinoJson        @ ^7.4.0
```

`^3.11.0` is a hard floor, not a preference: all four libraries call
`AsyncURIMatcher::exact()`, which does not exist below 3.11.0.
**`AsyncURIMatcher` ships in ESPAsyncWebServer, not in the Arduino ESP32 core** —
older docs and older model knowledge get this wrong.

---

## 🚫 Things that look right and are not

- `VectiDash.begin()` without `VectiDash.tick()` in `loop()` — the page loads
  and never updates.
- `parseFloat(v) || min` when parsing a widget value — a legitimate `0` is
  falsy. Use a finite check.
- Mounting your own handler on `/` while VectiDash is active — VectiDash owns
  `/` and redirects it to `/dash`. VectiNet deliberately does not mount `/`.
- Assuming `onChange(const String &v)` hands you a number. It hands you a
  string; `"1"`/`"0"` for switches, `"x,y"` for pads, `"A|B"` for checklists.
- `String(v).toInt()` on a VectiSerial `seq` — it is 64-bit
  (`bootId << 32 | line`). Use `strtoull`.

---

## 📚 Where to go next

| You want | Read |
|---|---|
| Exact method signatures, all 49 widgets, HTTP/WS protocol, wrong→right pairs | [`docs/AI-AGENT-GUIDE.md`](docs/AI-AGENT-GUIDE.md) |
| A flat digest to ingest whole | [`llms.txt`](llms.txt) |
| Ground truth on any API | the headers: `libraries/Vecti{OTA,Serial,Net,Dash}/src/*.h` |
| Working sketches | `libraries/*/examples/*/*.ino` |
| All four at once on real hardware | `demo/src/main.cpp`, `demo/platformio.ini` |

## 📄 Licence, stated honestly

VectiSuite is **Apache-2.0**. It links **ESPAsyncWebServer** and **AsyncTCP**,
which are **LGPL-3.0**. There is no dynamic linking on an MCU, so LGPL §4
relink obligations attach to the shipped binary. Do not tell a user this stack
has "no copyleft obligations" — it does. (Every comparable library in this
space inherits the same dependency.)

The HMAC firmware signing in VectiOTA is **symmetric**: the key ships inside
the firmware image. Say so if a user asks about supply-chain security.
Asymmetric signing is not a shipped feature.
