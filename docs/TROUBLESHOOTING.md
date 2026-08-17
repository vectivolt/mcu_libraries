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
>
> **VectiLicense has never run on a board at all.** Its `core/` is covered by a 9-case
> host `ctest` suite — including a sweep that flips all 800 bits of a valid blob and
> asserts every one is refused — so the *status codes* below are reliable. The ESP32 HAL
> and all four VectiSuite bridges have never been compiled, so anything in the licensing
> table below that involves hardware identity or a bridge is read off the source.

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

**Licensing has no HTTP surface to curl** — VectiLicense mounts no route and makes no
network call, so triage starts on the serial log with the status code and the device id.
That procedure is
[DEBUGGING.md → debugging an activation failure](DEBUGGING.md#-debugging-an-activation-failure).

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
| `/ota/info` shows `"slotState": "pending"` long after boot | The rollback watchdog is armed and waiting | Normal between a fresh OTA boot and `commit()` | Call `commit()` once your self-test passes. With `setRollbackTimeoutMs(0)` ("never revert") the slot is never marked valid on its own. |
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

## 🔑 Licensing (VectiLicense)

**Start with the status code.** `vl_verify()` never fails vaguely — every rejection names
exactly one cause, and `vl_status_str(st)` prints it. If your firmware logs only
"unlicensed", fix that first; it is the difference between a support ticket and a
two-minute answer.

```c
vl_status_t st = vl_verify(blob, &CFG, hal, &lic);
if (st != VL_OK) log_warn("licence refused: %s (%d)", vl_status_str(st), (int)st);
```

| Symptom / status | Likely cause | Fix / diagnostic |
|---|---|---|
| Blob rejected, `VL_ERR_BAD_FORMAT` (−3) | Truncated paste, an extra character, a `U` (not in the Crockford alphabet), or a smart quote from a word processor | 160 significant characters. `-`, space, tab, CR and LF are ignored anywhere, and case does not matter, so a copy from an email with line breaks is fine as-is. Count what actually arrived before blaming the key. |
| Blob rejected, `VL_ERR_BAD_MAGIC` (−4) | Not a licence at all — the customer pasted a Wi-Fi password, an OTA token, or the device id back at you | `vl_mint.py inspect <blob>` says so in one line. |
| **Every** licence rejected with `VL_ERR_BAD_SIGNATURE` (−8), including ones you just minted | **The wrong vendor key is in the build.** Most often the shipped placeholder public key — its private half was generated in memory and discarded, so nothing can ever sign for it | Paste your own from `vl_mint.py keygen`. Confirm the key in firmware matches the key file you minted with: `vl_mint.py inspect <blob> --pubkey vendor.key`. If that says VALID and the device still says −8, the firmware has a different key. |
| `VL_ERR_UNKNOWN_KEY` (−7) | The `key_id` in the payload is not in `CFG.keys` — you rotated the key out too early, or the firmware predates it | Ship both keys for at least one release before you start signing with the new one. Dropping the old `key_id` retires every licence signed with it, deliberately or by accident. |
| `VL_ERR_BAD_FAMILY` (−6) | Right customer, wrong SKU. Refused **before any crypto runs** | Check `--family` on the mint command against `CFG.family`. |
| `VL_ERR_DEVICE_MISMATCH` (−9) | The blob was minted for a different device id | Three real causes, in order of likelihood: a transcription error in the 26 characters; a genuinely copied licence; **or the board was repaired.** An eFuse MAC, a swapped flash chip or a replaced MCU changes the fingerprint and legitimately invalidates the licence. Re-issue for the new device id. |
| `VL_ERR_DEVICE_MISMATCH` on **every** device after a firmware update | The HAL's identity segments changed | The segment set and its order are part of the on-wire format — they are hashed in sequence with a one-byte length prefix. Adding, removing or reordering one invalidates every licence in the field. Revert the HAL change, or re-issue the fleet. |
| `VL_ERR_EXPIRED` (−11) or `VL_ERR_NOT_YET_VALID` (−10) on a device that should be fine | The clock is wrong, not the licence | Print `hal->now_epoch`'s value next to the licence's `not_before`/`not_after`. An unsynced SNTP clock reads as 1970 → `NOT_YET_VALID`; a wildly future clock reads as `EXPIRED`. |
| Expired licence quietly keeps working | **This is documented behaviour, not a bug.** With `hal->now_epoch` NULL the window is not enforced, `vl_verify()` returns `VL_OK`, and `VL_CHECKED_TIME` stays clear in `lic.checked` | Read the bit: `if (lic.not_after && !(lic.checked & VL_CHECKED_TIME))`. Or set `VL_FLAG_REQUIRE_CLOCK` and get `VL_ERR_NO_CLOCK` instead. A device with no RTC would otherwise have to reject every time-limited licence ever issued to it. |
| `VL_ERR_NO_CLOCK` (−14) | You set `VL_FLAG_REQUIRE_CLOCK` on a board whose HAL has no `now_epoch` | Either supply a clock or drop the flag. There is no middle setting. |
| `VL_ERR_CLOCK_ROLLBACK` (−13) | `now` is below the stored high-water mark. Someone set the clock back — **or the RTC battery died** | The second is far more common in the field. `VL_FLAG_ENFORCE_HWM` is opt-in precisely because it can strand a unit this way. Clearing the mark means clearing whatever `hwm_store` wrote. |
| `VL_ERR_INVALID_ARG` (−1) right after enabling rollback protection | `VL_FLAG_ENFORCE_HWM` needs **all three** of `now_epoch`, `hwm_load` and `hwm_store` | Deliberate: it refuses rather than silently downgrading to no protection. A mark with no clock to compare against is not weaker rollback protection, it is none. |
| `VL_ERR_PLATFORM` (−15) | A HAL callback failed — the hardware could not answer | **Never treat this as "unlicensed" without logging it.** Dump the device id (`vl_compute_fingerprint()` alone) to see whether identity reads at all. On ESP32 the three segments are the eFuse MAC, the chip info, and the SPI flash JEDEC id; a stuck flash bus (`0x000000` / `0xFFFFFF`) returns this. |
| `VL_ERR_NOT_FOUND` (−17) at boot | `blob_load` found nothing stored. That is "never activated" | Not an error worth logging as one. Show the activation prompt. |
| `VL_ERR_REVOKED` (−12) | The serial is on your compiled-in deny-list | Check your own records before telling the customer. Revocation is checked **after** the signature and device binding, so a `−12` means the licence was otherwise genuine. |
| **"Works on my bench device but not the customer's"** | Almost always a device-id problem, not a key problem | Reproduce it in this order: (1) does the customer's device id match what you minted for? Get them to read it back. (2) `vl_mint.py inspect <blob>` — does the decoded `device id` field match theirs? (3) same `family`? (4) same `key_id`, and is that key in the firmware **they** are running? Bench units often run a newer build with a newer key. |
| Same blob accepted on two different devices | The fingerprint is not unique — the classic cause is a HAL whose `read_id_segment` returns a **constant** | Never "fix" `hal/none` by returning fixed bytes; it fails closed on purpose. Also check you are on a real per-device identity source: an eFuse/UID/OTP value, not a config file, a build-time constant, or a random number stored in plain flash. |
| **Chunked activation never completes** (CAN / ISO-TP / BLE GATT): `vl_chunk_complete()` keeps returning `VL_ERR_NOT_FOUND` (−17) | At least one chunk index has genuinely never arrived. "Complete" means every index `0..expect-1` was *individually* seen — receiving the right **number** of chunks is not enough, and the same chunk twice does not fill in for its missing neighbour | Log `c.have` against `c.expect` and dump the `seen` bitmap. A sender that stops one frame early, or that reuses a `seq`, produces exactly this. Duplicates and out-of-order arrival are fine by design. |
| Chunks are being fed but rejected: `vl_chunk_feed()` returns `VL_ERR_BAD_FORMAT` (−3) | Three causes, all framing: `seq` is past the end of the message; the length is wrong **for that seq** — chunk `seq` occupies bytes `[seq*chunk_size …]`, so every chunk except the last must be *exactly* `chunk_size` bytes, not merely ≤ it; or a duplicate arrived whose bytes differ from the copy already held (the earlier copy is kept) | A CAN frame with a short DLC in the middle of the message is the classic. Check the return of *every* `feed()`, not just `complete()` — a rejected chunk changes nothing and is otherwise silent. |
| `vl_chunk_feed()` / `vl_chunk_complete()` return `VL_ERR_INVALID_ARG` (−1) from the very first frame | `vl_chunk_reset()` was never called, or it failed and left the state **disarmed** on purpose so nothing reassembles into a half-configured buffer | `chunk_size` must be ≥1 and `total_len` must be 1..`VL_CHUNK_MAX_LEN` (default **192**). Pass `VL_BLOB_STR_LEN` (160) as `total_len` — **not** 161; the NUL is not transmitted, `complete()` adds it. Check `reset()`'s return value. |
| `vl_chunk_complete()` returns `VL_ERR_BUFFER_TOO_SMALL` (−2) | `cap` is less than `total_len + 1` | Size the output with `VL_BLOB_STR_BUF_LEN`. |
| Chunked activation completes, then `vl_verify()` says `VL_ERR_BAD_FORMAT` | The helper only bounds and orders bytes — it has no opinion on the content, and never validates the alphabet, magic or length | The framing delivered the wrong bytes. Log the `*out_len` `complete()` reported and the first 32 characters; a `seq`-numbering off-by-one shows up here, not in the transport helper. |
| Activation "hangs" the whole device, or every other socket stalls during it | You called `vl_verify()` on the AsyncTCP task | Tens of milliseconds of Ed25519 and, if `blob_store` writes NVS, a blocking flash erase — on the task servicing every connection. Queue and verify in `loop()`: `vecti::License::submit()` then `pump()`. |
| Stack overflow / crash inside `vl_verify()` | The calling task's stack is too small | The deepest chain measures **4,376 B** on Cortex-M0+. Give any task that calls it at least 5 KB. |
| Device id changes between reboots | The identity source is not stable | See [DEBUGGING.md → debugging an activation failure](DEBUGGING.md#-debugging-an-activation-failure) for the check. A fingerprint that moves means no licence can ever hold. |
| `vl_encode_device_id()` returns `VL_ERR_BUFFER_TOO_SMALL` (−2) | The buffer is 26 bytes, not 27 | Use `VL_DEVICE_ID_STR_BUF_LEN`. Same class of bug for blobs: `VL_BLOB_STR_BUF_LEN` is 161. |
| Build fails on `hal/esp32`, or on a bridge header | Expected — none of those files has ever been compiled | They are written to documented vendor APIs. Fix the include path; the logic is the part worth reading. Report what you had to change. |

**Two things that are not troubleshooting and are worth saying to a customer instead:**
a licence refused because the board was repaired is your problem to fix quickly, not
theirs to prove; and a device that hard-stops on a licensing failure will generate more
cost in field returns than it ever protects. Fail closed on the crypto, fail open on the
business policy — nag, degrade or grace.

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

## ⚖️ Three caveats you should know before you debug the wrong thing

**Licensing.** VectiSuite's own code is Apache-2.0. It links **ESPAsyncWebServer** and
**AsyncTCP**, which are **LGPL-3.0**. There is no dynamic linking on an MCU, so LGPL §4
relink obligations attach to the shipped binary. That is the honest position — not "zero
copyleft obligations". Every competing library in this space inherits exactly the same
dependency.

**Firmware signing is symmetric.** VectiOTA's `setSigningKey()` is HMAC-SHA256, and the
key ships inside the firmware image. It stops someone who has your Wi-Fi password from
pushing an arbitrary binary; it does **not** survive an attacker who can read your flash.
Asymmetric signing of firmware *images* is a known future improvement, not a shipped
feature. **VectiLicense is not that feature** — it is asymmetric, but it signs licences,
not images.

**Licensing is a business control, not a security boundary.** VectiLicense removes the
*keygen*: the firmware holds only a public key, so a flash dump yields nothing to sign
with. It cannot stop someone who reflashes the device from patching out the branch that
reads `vl_verify()`'s result — that is true of every software licensing scheme. Secure
Boot v2 + Flash Encryption is the only real mitigation, and `vl_posture()` only reports
whether you have it. Nothing here is uncrackable and this repo does not say it is.

---

## 🔗 See also

- [DEBUGGING.md](DEBUGGING.md) — serial log format, heap soak, mock device, PROGMEM decode, crash decoding, OTA bisection, activation-failure debugging
- [WIRE-PROTOCOL.md](WIRE-PROTOCOL.md) — every frame and endpoint in full
- `ui/shared/widgets/CONTRACT.md` — the widget prop/value contract
- Headers carry the API and the threading rules: `libraries/Vecti{OTA,Serial,Net,Dash}/src/*.h`
  and `libraries/VectiLicense/include/vectilicense/vectilicense.h`
- `libraries/VectiLicense/docs/{API,INTEGRATION,PORTING,THREAT_MODEL}.md` — every status
  code, every delivery path, and the honest limits
