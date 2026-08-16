# 🚑 VectiSuite troubleshooting

Symptom-first. Find your row, run the diagnostic, apply the fix.
For *technique* — reading the log, running a heap soak, decoding a crash — see
[DEBUGGING.md](DEBUGGING.md).

> **Honesty note.** VectiSuite has been verified on real hardware over USB serial only:
> it flashes, boots, initialises PSRAM, registers its routes and starts mDNS, and it
> does not leak heap. The HTTP responses, the WebSocket dashboard, OTA upload/pull/rollback
> and end-to-end captive-portal provisioning have **not** been exercised against a device
> on a LAN. The causes below are read off the source and the wire format; if one of them
> is wrong, it is wrong because the path was never run, not because it was measured
> differently. File an issue.

---

## ⏱ 30-second triage

Run these three before reading any table. `$DEV` is the device IP or `vecti-demo.local`.

```bash
# 1. Is the HTTP server answering at all?
curl -s -o /dev/null -w '%{http_code}\n' http://$DEV/dash

# 2. What does the device think its own state is?
curl -s http://$DEV/wifi/status          # VectiNet: state, ip, rssi, heap, uptime_s
curl -s http://$DEV/ota/info             # VectiOTA: currentSlot, nextSlot, slotState, freeHeap

# 3. What is it saying on the wire it cannot lie about?
pio device monitor -b 115200             # from demo/
```

`/wifi/status` `state` is the `NetState` enum: `0` Idle · `1` Connecting · `2` Connected ·
`3` Portal · `4` Failed.

If step 1 is a connection refused and step 3 is silent too, jump to
[DEBUGGING.md → my device is unreachable](DEBUGGING.md#-decision-tree-my-device-is-unreachable).

---

## 🌐 The page

| Symptom | Likely cause | Fix / diagnostic |
|---|---|---|
| Browser: connection refused, nothing in the log | `server.begin()` never ran, or it ran before the libraries mounted their routes | `begin()` on all four libraries, **then** `server.begin()`. The demo prints `HTTP server up — routes: / /dash /ota /serial /wifi` — no line, no server. |
| `404` on `/dash`, `/ota`, `/serial` or `/wifi` | That library's `begin()` was not called, or was called on a different `AsyncWebServer` instance | One `AsyncWebServer server(80);` shared by all four. `curl -sI http://$DEV/dash` |
| `/ota` works but `/ota/info` 404s, or `/dash` swallows `/dash/ws` | An app route registered with plain `server.on("/ota", ...)` somewhere in *your* sketch — ESPAsyncWebServer 3.x default matching is prefix-based | Use `AsyncURIMatcher::exact("/ota")`, as the libraries do. Needs ESPAsyncWebServer **≥ 3.11.0**. |
| Build fails: `AsyncURIMatcher` not declared | ESPAsyncWebServer older than 3.11.0 resolved | `lib_deps = ESP32Async/ESPAsyncWebServer @ ^3.11.0`. It comes from ESPAsyncWebServer, **not** the Arduino core. |
| Page loads as garbage / raw bytes | A proxy or middlebox stripped `Content-Encoding: gzip` | The UI ships as a gzipped PROGMEM blob and is served with that header. `curl -sI http://$DEV/dash \| grep -i content-encoding` must show `gzip`. |
| Page half-loads then stalls on weak Wi-Fi | Wi-Fi modem sleep / low TX power dropping ACKs mid-response | VectiNet already sets `WiFi.setSleep(false)` and `setTxPower(WIFI_POWER_19_5dBm)` on each attempt. If you call `WiFi.begin()` yourself, do the same. Check `rssi` in `/wifi/status` — worse than −75 dBm is the danger zone. |
| `401` on every request including the HTML | Auth is configured and the browser has no credentials yet | Expected. `curl -u admin:vecti http://$DEV/dash`. Note VectiNet gates **every** `/wifi` route including the read-only JSON. |
| `/dash/login` challenges but `/dash` does not | `allowAnonymousRead=true` — by design | `/dash/login` is the only route that challenges in that mode; it plants the write ticket cookie. |
| mDNS name does not resolve | mDNS started but the client OS is not doing mDNS, or you are on a different subnet/VLAN | Use the raw IP from `/wifi/status`. `dns-sd -B _http._tcp` (macOS) / `avahi-browse -a` (Linux). |

## 🔌 The WebSocket

`/dash/ws` (VectiDash) and `/serial/ws` (VectiSerial). Both are auto-reconnecting from the
browser side, with exponential backoff capped at 15 s and ±30 % jitter.

| Symptom | Likely cause | Fix / diagnostic |
|---|---|---|
| Page loads, widgets render, all values stay `—` | `VectiDash.tick()` is not being called from `loop()` | `tick()` is what serialises and pushes. Nothing reaches a client without it. Same shape of bug: `VectiSerial.loop()` missing → console renders and stays empty. |
| Values update but interactions do nothing | `onChange` callbacks also run from `tick()`; or the socket has no write ticket | Confirm `tick()` runs. If auth is on with `allowAnonymousRead`, the tab must visit `/dash/login` once to get the `jdash` cookie — `cmd` frames from an unauthenticated socket are silently dropped. |
| WebSocket connects then drops seconds later | Something blocked the AsyncTCP task — a `delay()`, `ESP.restart()` or a flash/NVS write inside a callback | Never block in a handler. `DashCardBase::onChange` is safe (it runs on `loop()`), but `VectiSerial.onMessage` and every raw `server.on()` handler run on **AsyncTCP**. Set a flag; act in `loop()`. See the demo's `requestReboot()` / `serviceReboot()` pair. |
| Socket drops on every page with 3+ tabs open | Client structs leaking because `loop()` is not reaping them | `VectiSerial.loop()` reaps disconnected `AsyncWebSocketClient` objects. Skipping it leaks one client struct + message queue per closed tab. |
| Reconnect storm after a device reboot | Several tabs retrying in lockstep | Already mitigated by the jittered backoff in `shared/lib/net.js`. If you wrote your own client, add jitter — AsyncTCP drops connections it cannot allocate. |
| Handshake never completes | Auth on the upgrade, or a proxy that does not pass `Upgrade` | Manual check, expect `101`: <br>`curl -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://$DEV/dash/ws` |
| Big `Input`/`Textarea` value never arrives | Inbound frame over the 4096-byte ceiling | `kMaxRxBytes` in `VectiDash.cpp` caps one inbound message at 4096 bytes so a peer cannot grow a per-client String without bound. Send less, or raise it and rebuild. |

## 📦 OTA

Every refusal is both an HTTP status and a `status` event on the SSE stream `/ota/events`.
Watch it while you upload — it is the fastest way to see *why*:

```bash
curl -N http://$DEV/ota/events            # leave running in another terminal
```

| Symptom | Status / event | Cause | Fix |
|---|---|---|---|
| Upload returns `429` | `rate-limited` | Default is one upload attempt per **5000 ms per IP** | Wait, or `VectiOTA.setRateLimitMs(2000)`. Cache is 8 IP slots — small office, not DoS-proof. |
| Upload returns `403` | `fw-disabled` / `fs-disabled` | That mode was turned off | `VectiOTA.allowFirmwareUpdates(true)` / `allowFilesystemUpdates(true)` |
| Upload returns `409` | `busy` | A pull, or another client's upload, already owns the updater | Wait for it. `curl -s http://$DEV/ota/info` → `"updating": true` |
| Upload returns `400` | `sig-missing` | A signing key is set and the request carried no `X-Vecti-Signature` header | See the signing recipe below |
| Upload returns `400` | `sig-mismatch` | HMAC over the image bytes did not match | Recompute; check you hashed the **image file**, not the multipart envelope |
| Upload returns `400` | `sig-unavailable` | The key is not valid hex, or the crypto backend would not start | `setSigningKey()` takes **hex**, max 64 bytes of key (128 hex chars). Fails closed by design. |
| Upload returns `400` | `no image received` | Multipart body had no file part | `curl -F 'firmware=@.pio/build/esp32s3-n8r2/firmware.bin' http://$DEV/ota/upload` |
| Upload returns `500` | `begin-failed:<err>` | No OTA partition big enough | `curl -s http://$DEV/ota/info` → `freeOta`. An 8 MB board needs `default_8MB.csv`; the stock ESP32-S3 board file targets N16R8. |
| Upload returns `500` | `write-short:<err>` / `end-failed:<err>` | Flash write failed or the image is truncated/corrupt | Re-upload. Compare byte counts: `ls -l firmware.bin` vs. what the progress events report. |
| Pull returns `403` / `501` | — | `allowPullMode(false)`, or pull is unsupported on the target | `VectiOTA.allowPullMode(true)`; pull is ESP32-only |
| Pull refused immediately | `pull-tls-unpinned` | `https://` URL with neither a CA nor the insecure opt-in | `VectiOTA.setPullCACert(rootCaPem)` (the pointer must outlive the device — use a literal), or `allowInsecurePullTls(true)` for a lab. |
| Pull fails partway | `pull-http-<code>`, `pull-no-length`, `pull-stalled`, `pull-truncated`, `pull-timeout` | Server did not send `Content-Length`, or the connection died | The event name tells you which. `pull-stalled` = connection still open but no bytes; `pull-truncated` = it closed early. |
| Upload succeeds, device reboots into the **old** image | `rollback-watchdog` on the SSE stream | The new firmware never called `VectiOTA.commit()` inside `setRollbackTimeoutMs()`, so the bootloader reverted | This is the feature working. Call `commit()` after a real self-test. The demo waits for 20 s uptime **and** `WiFi.status() == WL_CONNECTED` first. |
| Upload succeeds, device reboots into the old image, **no** rollback event | You uploaded in filesystem mode | `mode` defaults to `firmware`; `?mode=filesystem` lands in the SPIFFS/LittleFS partition | Check the `start:` event — it names the content type for the mode that ran. |
| Upload succeeds, device never reboots | An `onBeforeReboot` callback returned `false` | That suppresses the automatic reboot on purpose | Return `true`, or reboot yourself once your shutdown finishes. |
| `/ota/info` shows `"slotState": "pending"` long after boot | The rollback watchdog is armed and waiting | Normal between a fresh OTA boot and `commit()`. If it stays pending with no timeout set, `setRollbackTimeoutMs(0)` means "never revert" — the slot just never gets marked valid. |
| `/ota/rollback` returns `409` | `rollback-unavailable` | There is no other valid slot to go back to (e.g. serially-flashed build) | Expected. Nothing to revert to. |

**Signing a firmware image** (symmetric HMAC-SHA256 — see the caveat at the bottom):

```bash
KEY=00112233445566778899aabbccddeeff              # same hex string as setSigningKey()
BIN=.pio/build/esp32s3-n8r2/firmware.bin
SIG=$(openssl dgst -sha256 -mac HMAC -macopt hexkey:$KEY -r "$BIN" | cut -d' ' -f1)
curl -f -F "firmware=@$BIN" -H "X-Vecti-Signature: $SIG" http://$DEV/ota/upload
```

Filesystem image instead: `curl -f -F "fs=@littlefs.bin" 'http://$DEV/ota/upload?mode=filesystem'`.

## 📶 Wi-Fi provisioning

| Symptom | Likely cause | Fix / diagnostic |
|---|---|---|
| Captive-portal sheet never pops on the phone | You joined a device that is **not** in portal state | `curl -s http://192.168.4.1/wifi/status` → `state` must be `3`. If it is `2`, the device already joined a network and took the AP down. |
| Portal sheet never pops, but `http://192.168.4.1/wifi` loads by hand | The OS probe was answered from cache, or the phone is on cellular-assist | VectiNet registers all four probes — `/generate_204` and `/gen_204` (Android), `/hotspot-detect.html` (iOS/macOS), `/ncsi.txt` (Windows) — plus a DNS wildcard. Verify: `curl -s -o /dev/null -w '%{http_code}\n' http://192.168.4.1/generate_204` (expect the portal, not `204`). Toggle Wi-Fi off/on to force a fresh probe. |
| Credentials save, device never joins | Wrong PSK, or the SSID is 5 GHz-only | Watch the state machine in `/wifi/status`: `1` Connecting → back to `3` Portal means the sweep exhausted every saved network. Each attempt gets `setConnectTimeoutMs()` (default 15 s). ESP32 is 2.4 GHz only. |
| Credentials save, device joins, then drops back to the portal minutes later | The reprovision watchdog fired | Disconnected for longer than `setReprovisionMs()` (default 60000 ms) raises the portal automatically. Raise the timeout or fix the link. |
| `saveCredentials()` returns `false` | All 8 persisted slots are full | `VectiNet.clearAllCredentials()`, or drop one. A 9th would work until reboot and then vanish — hence the honest `false`. |
| A saved network vanished after a power cut mid-save | NVS writes are not transactional | The network count is written **last**, so a power cut can lose the newest slot but never makes NVS claim a slot it does not hold. Re-save it. |
| `setHostname()` / `setMdnsName()` / `setCountryCode()` appear to be ignored | They are not — they *win* over NVS, and the portal's matching field then only lasts until the next reboot | Pick one owner: hardcode in the sketch, **or** leave unset and let the portal own it. |
| Only channels 1–11 available, weak TX | Country code still the default `"01"` worldwide map | `VectiNet.setCountryCode("IN")` (or your regulatory domain) before `begin()`. `"01"` and `"US"` get 11 channels, everything else 13. |
| Device comes up on a stale static IP after moving site | Static IP was applied once and arduino-esp32 remembers it | Handled: VectiNet calls `WiFi.config(0,0,0)` to restart the DHCP client when static is off. If you call `WiFi.config()` yourself, do the same. |
| Crash at boot: `tcpip_api_call ... Invalid mbox` | `WiFi.setHostname()` before `WiFi.mode()` | `WiFi.mode(WIFI_STA)` first — it initialises the esp_wifi/lwIP glue. VectiNet's `begin()` already does this in order. |
| Portal POST returns `409` | A previous save is still being applied by `loop()` | One handoff slot, one writer. Retry in a moment. |

## 🖥 Console (VectiSerial)

| Symptom | Likely cause | Fix / diagnostic |
|---|---|---|
| Console page loads, no lines ever appear | `VectiSerial.loop()` not called | `_log()` only appends to the ring. Both sinks — the hardware-Serial mirror and the WebSocket broadcast — are driven by `loop()`. Stop calling it and logging stops. |
| Nothing on the USB serial monitor either | `setMirrorToHardwareSerial(false)`, or `Serial.begin()` was never called | Mirror is on by default. Lines look like `[123456] INF heartbeat up=…` — uptime in ms, then `DBG`/`INF`/`WRN`/`ERR`. |
| Console goes silent after the device reboots — and stays silent | This is the bug the boot-id exists to prevent; if you see it, the NVS boot counter is not advancing | `seq` is `(bootId << 32) + line`, with `bootId` from an NVS counter bumped in `begin()`. The browser dedupes on a monotonic `seq` across reconnects, so a counter that restarts at 1 makes every open tab discard the whole log. Hard-reload the tab to reset its high-water mark; then check NVS is writable. |
| Old lines replay duplicated after a reconnect | A custom client without seq dedupe | The bundled UI keeps `maxSeq` and drops `l.seq <= maxSeq`. History arrives as multiple `hist` frames of 64 lines each, not one. |
| Long log lines come back truncated with an ellipsis | Line exceeded the stack buffer and then the heap cap | By design — a clipped line is marked so it never reads as a complete one. Shorten the format string. |
| Typing a command does nothing | No `onMessage` handler registered, or the handler blocked | Inbound frames are `{"type":"cmd","text":"…"}`. The callback runs on the **AsyncTCP task**: no `delay()`, no `ESP.restart()`, no NVS write. Logging from it is fine. |
| Console eats heap on a long soak | `setHistorySize()` too large for your line lengths | The ring is the queue. See [DEBUGGING.md → heap soak](DEBUGGING.md#-heap-soak-real-leak-vs-bounded-ring). |

![VectiSerial console, dark theme](screenshots/serial-dark.png)

## 📊 Widgets and charts

| Symptom | Likely cause | Fix / diagnostic |
|---|---|---|
| Card renders `Unsupported widget <type> — update the device UI.` | The firmware sent a type key the bundled UI does not know | Three things must agree: the `DashType` enumerator, the string `typeName()` returns in `VectiDash.cpp`, and the key in `ui/shared/widgets/index.js`. Most common cause: firmware newer than the embedded UI blob. Rebuild: `npm --prefix ui run build` (this also re-embeds the PROGMEM headers). |
| Chart card is blank — axes, no line | Fewer than 2 points. `chartOf()` returns `null` below that | Push at least two: `card.chartPushXY(x, y)`. The demo pre-seeds 30 points in `setup()` so the first viewer sees something. |
| Chart blank with plenty of data | You called `setValue()` on a `Chart` card instead of `chartPushXY()` | `chartPushXY()` / `chartSetSeries()` encode `{"x":[…],"y":[…]}` for you. A hand-built string must match that shape exactly. |
| Chart drops the oldest points | Working as intended — `chartSetMaxPoints()` (default 50) | Raise it, and watch the heap: the series is re-encoded to a JSON string on every push. |
| Chart x-axis spacing looks wrong | `x` and `y` arrays are different lengths, so the renderer falls back to even index spacing | Keep them equal. `chartPushXY()` always does. |
| A gauge/slider sitting at `0` snaps to its minimum | Custom widget using `parseFloat(v) || min` | Use `num(value, fallback)` from `$shared/lib/net.js`. `0` is falsy — this is rule 1 of the widget contract. |
| `table` / `logview` / `heatmap` render empty | Value is not the JSON shape that widget expects | All values cross the wire as **strings**. `table`: `[["Key","Val"],…]` or `"k=v;k=v"` · `logview`: `["line","line"]` or newline-separated · `heatmap`: `{"w":8,"v":[…]}` row-major, max 2048 cells · `histogram`: `{"l":["a"],"v":[1]}` · `multichart`: `{"x":[…],"s":[{"n":"L1","y":[…]}]}`, max 5 series. |
| `dropdown` / `radio` / `checklist` show no choices | `setOptions()` never called | Pipe-separated: `mode.setOptions("Eco|Standard|Boost")`. A checklist reports back the same way (`"Eco|Boost"`). |
| `datetime` shows 1970 | Passed milliseconds | It takes Unix epoch **seconds**. |
| `<script>` inside `setCustomHtml()` never runs | Deliberate — the snippet is injected as markup | The only live part is `<span id="dash-<id>-out">`, which the runtime fills from `setValue()`. Everything else is inert. |
| Cards jump between tabs / reorder unexpectedly after a runtime change | Layout frame is stale | `VectiDash.refreshLayout()` after adding or reconfiguring cards. |

## 💥 Stability

| Symptom | Likely cause | Fix / diagnostic |
|---|---|---|
| Boot loop, guru meditation each cycle | Real crash | Turn on the decoder and read the backtrace — see [DEBUGGING.md → esp32_exception_decoder](DEBUGGING.md#-decoding-a-crash). |
| Boot loop with **no** panic, ~ every N seconds | The rollback watchdog reverting an image that cannot commit | The reverted-to slot is the one running. `curl -s http://$DEV/ota/info` → `slotState`. Fix the self-test or extend `setRollbackTimeoutMs()`. |
| `PSRAM ID read error` at boot, PSRAM disabled | Wrong memory type for the module | N8R2 is QSPI: `board_build.arduino.memory_type = qio_qspi`. `qio_opi` is for N16R8. |
| Crash the moment a browser interacts with a card | A blocking or stack-hungry call in an AsyncTCP-task callback | `DashCardBase::onChange` runs on `loop()` and is safe. `VectiSerial.onMessage` and raw `server.on()` handlers do **not**. |
| Heap falls steadily and never flattens | Either a real leak, or a bounded ring still filling | Do not guess — run the soak procedure in [DEBUGGING.md](DEBUGGING.md#-heap-soak-real-leak-vs-bounded-ring). The measured VectiSuite demo goes flat; a ring that never flattens is the signal. |
| Heap oscillates by a few hundred bytes | One alloc/free cycle of the JSON serialisation buffer | Measured at ±496 B on the demo. Not a leak. |
| Random `Update` failures under memory pressure | Fragmented heap after hours of uptime | `freeHeap` in `/ota/info` is total free, not largest block. Reboot before a fleet update if you can. |
| Build pulls in an ESP8266/RP2040 async TCP port and dies on an `#error` | Stale libraries in `~/.platformio/lib` | `lib_ignore = AsyncTCP_RP2040W` + `ESPAsyncTCP`, as in `demo/platformio.ini`. |

---

## ⚖️ Two caveats you should know before you debug the wrong thing

**Licensing.** VectiSuite's own code is Apache-2.0. It links **ESPAsyncWebServer** and
**AsyncTCP**, which are **LGPL-3.0**. There is no dynamic linking on an MCU, so LGPL §4
relink obligations attach to the shipped binary. That is the honest position — not "zero
copyleft obligations". Every competing library in this space inherits exactly the same
dependency.

**Firmware signing is symmetric.** `setSigningKey()` is HMAC-SHA256, and the key ships
inside the firmware image. It stops someone who has your Wi-Fi password from pushing an
arbitrary binary; it does **not** survive an attacker who can read your flash. Asymmetric
signing (Ed25519) is a known future improvement, not a shipped feature.

---

## 🔗 See also

- [DEBUGGING.md](DEBUGGING.md) — serial log format, heap soak, mock device, PROGMEM decode, crash decoding, OTA bisection
- [WIRE-PROTOCOL.md](WIRE-PROTOCOL.md) — every frame and endpoint in full
- `ui/shared/widgets/CONTRACT.md` — the widget prop/value contract
- Headers carry the API and the threading rules: `libraries/Vecti{OTA,Serial,Net,Dash}/src/*.h`
