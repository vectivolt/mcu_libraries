# AGENTS.md — VectiSuite

Instructions for AI coding agents writing firmware against the five libraries in
this repo. Read this before you write a sketch. The deep reference — every
method signature, every endpoint, all 50 `DashType` types (49 widgets plus
`Custom`, the raw-HTML escape hatch), the full VectiLicense C API, wrong→right
code pairs — is [`docs/AI-AGENT-GUIDE.md`](docs/AI-AGENT-GUIDE.md).

If you only remember four things:

1. **`loop()` is not optional.** Every web library has a per-loop hook with a
   different name. Skip it and the library silently does nothing.
2. **Never block in a callback.** Callbacks that fire on the AsyncTCP task must
   set a flag; `loop()` does the work. `delay()` / `ESP.restart()` there breaks
   every other connection on the device.
3. **Everything on the VectiDash wire is a string.** `setValue(0)` sends `"0"`.
4. **VectiLicense verifies; it never mints.** The device holds a **public** key
   only. Never write code that puts a private key, a seed, or a signing routine
   in firmware — and never write code that "checks a licence" over the network.
   There is no server to check with.

---

## 📦 What the five libraries are

| Library | Job | Routes it mounts | Loop hook | Platform |
|---|---|---|---|---|
| **VectiOTA** | Firmware + filesystem OTA — browser drag-drop, pull-from-URL, HMAC signing, A/B rollback | `/ota` `/ota/info` `/ota/upload` `/ota/pull` `/ota/events` `/ota/commit` `/ota/rollback` | `VectiOTA.loop()` | ESP32, ESP8266 |
| **VectiSerial** | Wireless console over WebSocket — 4 log levels, history replay, command input | `/serial` `/serial/ws` | `VectiSerial.loop()` | ESP32 |
| **VectiNet** | Wi-Fi provisioning — captive portal, up to 8 saved SSIDs, custom parameters in NVS | `/wifi` `/wifi/scan` `/wifi/connect` `/wifi/status` `/wifi/params` `/wifi/reset` `/wifi/restart` `/generate_204` `/gen_204` `/hotspot-detect.html` `/ncsi.txt` | `VectiNet.loop()` | ESP32 only (`#error` otherwise) |
| **VectiDash** | Realtime dashboard, 49 widgets + `Custom`, single WebSocket | `/` (302 → `/dash`) `/dash` `/dash/login` `/dash/ws` | `VectiDash.tick()` | ESP32 |
| **VectiLicense** | Offline device licensing — Ed25519, **verify-only**, no network ever. C API, not an Arduino class | **none.** No routes, no sockets, no server | none — call `vl_verify()` when a blob arrives and at boot. (`vecti::License::pump()` if you use the C++ bridge) | **any C99 target.** Freestanding core; platform code lives in `vl_hal_t` |

The first four mount onto **one** `AsyncWebServer` you own. C++ namespace is
`vecti::`; the globals `VectiOTA` / `VectiSerial` / `VectiNet` / `VectiDash` are
already declared by the headers — do not instantiate your own.

VectiLicense is different in kind: a C library with no global instance, no
server, and no Arduino dependency. `#include <VectiLicense.h>` in a sketch, or
`#include "vectilicense/vectilicense.h"` anywhere else.

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

That is the whole integration surface for the four web libraries. Everything
else is configuration.

VectiLicense does not appear there because it does not belong in that shape: it
mounts nothing and has no loop hook. Add it as a gate — see
[the VectiLicense rule](#-the-vectilicense-rule-an-agent-must-not-get-wrong)
below. `demo/src/main.cpp` does **not** include it.

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

**VectiLicense** — `vl_verify()` returns a `vl_status_t`, and **only `VL_OK`
means licensed**. Every failure is negative and each names a different cause;
`if (vl_verify(...))` reads backwards and treats every rejection as success.
Log `vl_status_str(st)` — "refused" is a support ticket, "licence is for a
different device" is a two-minute fix. Second trap: `VL_OK` does not mean the
expiry was checked. On a device with no `now_epoch` the window is skipped and
`VL_CHECKED_TIME` stays clear in `lic.checked`.

---

## 🔑 The VectiLicense rule an agent must not get wrong

**The device verifies. It never mints.** That is not a style preference, it is
the whole point of the design.

```c
/* ✅ RIGHT — the 32 bytes in firmware are PUBLIC. Dumping the flash yields
   nothing an attacker can sign with. */
static const vl_pubkey_t VENDOR_KEYS[] = {
    { .key_id = 1, .key = { 0x02, 0x1a, /* ...30 more, from vl_mint.py keygen... */ } },
};
static const vl_config_t CFG = {
    .keys = VENDOR_KEYS, .key_count = 1,
    .family = 2,
    .revoked_serials = NULL, .revoked_count = 0,
    .flags = 0,
};

vl_license_t lic;
vl_status_t st = vl_verify(blob, &CFG, hal, &lic);
if (st == VL_OK && vl_has_feature(&lic, FEATURE_MODBUS)) enable_modbus();
```

There is **no signing function anywhere in the device build** — that code was
deleted from the vendored Ed25519, not disabled. If a user asks you to "generate
a licence on the device", the answer is that it is structurally impossible, and
that is the feature. Minting happens in
`libraries/VectiLicense/tools/vl_mint.py`, on the vendor's machine, and that
script is the only file in the suite that ever touches a private key.

Four failures an agent produces almost by reflex:

| Don't | Because |
|---|---|
| Embed a private key or a seed "so the device can self-activate" | that recreates the keygen the library exists to remove — one flash dump and every unit is unlocked forever |
| Add an HTTP call to an activation server | there is none. `vl_verify()` is pure computation; the transport contract is "a NUL-terminated string arrived from somewhere" |
| Leave the all-zero placeholder public key in `VENDOR_KEYS` | 32 zero bytes are a valid **low-order** curve point, and against a low-order key a signature can be forged with no private key. `core/` rejects such keys outright, so it fails closed — but only by luck of a guard, not by design of your code |
| Ignore the return status, or test it as a bool | every failure is negative and non-zero, so `if (vl_verify(...))` unlocks the product on **every** rejection |

### The whole public API — five functions

Transcribed from `libraries/VectiLicense/include/vectilicense/vectilicense.h`.
Where this and your prior knowledge disagree, the header is right.

```c
vl_status_t vl_verify(const char *blob, const vl_config_t *cfg,
                      const vl_hal_t *hal, vl_license_t *out);
vl_status_t vl_compute_fingerprint(const vl_hal_t *hal,
                                   uint8_t out_fingerprint[VL_FINGERPRINT_LEN]);
vl_status_t vl_encode_device_id(const uint8_t fingerprint[VL_FINGERPRINT_LEN],
                                char *out, size_t out_capacity);
int         vl_has_feature(const vl_license_t *lic, unsigned bit);   /* 0..31 */
vl_status_t vl_posture(const vl_hal_t *hal, vl_posture_t *out);      /* reports, never enforces */

const char *vl_status_str(vl_status_t status);   /* never NULL, for any int */
const char *vl_version_str(void);                /* "vectilicense/1.0.0" */
```

`out` may be NULL if you only want the verdict. On any failure `*out` is
zeroed, so a caller that ignores the return code sees no features rather than
stale ones.

### The HAL — one struct, one required member

```c
typedef struct vl_hal {
    /* REQUIRED. idx 0,1,2,…; return VL_ERR_NO_MORE_SEGMENTS to end the list. */
    vl_status_t (*read_id_segment)(void *ctx, uint32_t idx,
                                   uint8_t *out, size_t cap, size_t *out_len);
    vl_status_t (*now_epoch)(void *ctx, uint32_t *out_epoch);          /* optional */
    vl_status_t (*hwm_load)(void *ctx, uint32_t *out);                 /* optional, */
    vl_status_t (*hwm_store)(void *ctx, uint32_t value);               /*  both or neither */
    vl_status_t (*blob_load)(void *ctx, char *out, size_t cap, size_t *out_len);
    vl_status_t (*blob_store)(void *ctx, const char *blob, size_t len);
    vl_status_t (*secure_posture)(void *ctx, vl_posture_t *out);       /* optional */
    void *ctx;
} vl_hal_t;
```

**Only `read_id_segment` is required**; the core behaves correctly with every
other member NULL, and there is a 64-cell test matrix asserting it. Callbacks
must not allocate and must not block indefinitely; anything but `VL_OK` (or the
documented sentinel) fails closed. Ready-made HALs live in
`libraries/VectiLicense/hal/{esp32,rp2040,stm32,nxp,posix,none}/`, each exposing
a factory returning `const vl_hal_t *` — `vl_hal_esp32()`, `vl_hal_rp2040()`,
`vl_hal_stm32()`, `vl_hal_nxp()`, `vl_hal_none()` take no arguments;
`vl_hal_posix(const char *iface, const char *state_path)` takes two. Porting a
new board means copying `hal/none/` and writing one function.

Two HAL traps: **`vl_verify()` never calls `blob_load`/`blob_store`** — storage
is the application's job, they live in the struct so bridges have one place to
find them. And the identity segment set and its order are **part of the on-wire
format**: adding, removing or reordering one invalidates every licence already
issued for those devices.

### The wire format

100 binary bytes, 160 Crockford-base32 characters. `-`, space, tab, CR and LF
may appear anywhere as grouping and are ignored; input is case-insensitive and
the aliases `I`/`l` → `1`, `O` → `0` are folded.

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | `magic` — `VL_MAGIC` = `0x56` |
| 1 | 1 | `version` — `VL_FORMAT_VERSION` = `0x01` |
| 2 | 1 | `key_id` — selects among the embedded public keys |
| 3 | 1 | `family` — product line |
| 4 | 4 | `features` — LE 32-bit bitmap |
| 8 | 16 | `device_id` — first 16 bytes of the SHA-256 fingerprint |
| 24 | 4 | `not_before` — LE epoch seconds, 0 = unbounded |
| 28 | 4 | `not_after` — LE epoch seconds, 0 = perpetual |
| 32 | 4 | `serial` |
| 36 | 64 | `signature` — Ed25519 over `"vectilicense:v1" ‖ 0x00 ‖ payload[0..35]` |

Buffer sizes: `VL_BLOB_STR_BUF_LEN` = 161, `VL_DEVICE_ID_STR_BUF_LEN` = 27,
`VL_FINGERPRINT_LEN` = 32, `VL_PUBKEY_LEN` = 32. Use the macros, not the digits.

**The decoded bytes are canonical; the string is not.** Case, grouping and the
Crockford aliases mean one licence has many accepted spellings. Anything that
keys on the *string* — a redeemed-blob list, a de-duplicator — must canonicalise
by decoding and re-encoding, not by stripping dashes.

### Status codes

`VL_OK` is 0; **every failure is negative**, and no function returns `VL_OK` on
any error path. Pass any of them to `vl_status_str()`.

`VL_ERR_INVALID_ARG` −1 · `VL_ERR_BUFFER_TOO_SMALL` −2 · `VL_ERR_BAD_FORMAT` −3 ·
`VL_ERR_BAD_MAGIC` −4 · `VL_ERR_BAD_VERSION` −5 · `VL_ERR_BAD_FAMILY` −6 ·
`VL_ERR_UNKNOWN_KEY` −7 · `VL_ERR_BAD_SIGNATURE` −8 · `VL_ERR_DEVICE_MISMATCH` −9 ·
`VL_ERR_NOT_YET_VALID` −10 · `VL_ERR_EXPIRED` −11 · `VL_ERR_REVOKED` −12 ·
`VL_ERR_CLOCK_ROLLBACK` −13 · `VL_ERR_NO_CLOCK` −14 · `VL_ERR_PLATFORM` −15 ·
`VL_ERR_NO_MORE_SEGMENTS` −16 (HAL sentinel) · `VL_ERR_NOT_FOUND` −17
(`blob_load`: never activated) · `VL_ERR_INTERNAL` −18.

And read `lic.checked`, not just the return code — `VL_CHECKED_SIGNATURE`,
`VL_CHECKED_DEVICE`, `VL_CHECKED_TIME`, `VL_CHECKED_REVOCATION`,
`VL_CHECKED_HWM`. A licence can be cryptographically perfect with
`VL_CHECKED_TIME` clear because the board has no clock.

---

## 🔢 Version floor (get this wrong and nothing compiles)

```ini
lib_deps =
    ESP32Async/ESPAsyncWebServer @ ^3.11.0
    ESP32Async/AsyncTCP          @ ^3.4.0
    bblanchon/ArduinoJson        @ ^7.4.0
```

`^3.11.0` is a hard floor, not a preference: all four web libraries call
`AsyncURIMatcher::exact()`, which does not exist below 3.11.0.
**`AsyncURIMatcher` ships in ESPAsyncWebServer, not in the Arduino ESP32 core** —
older docs and older model knowledge get this wrong.

**VectiLicense has no dependencies at all** — not these three, not `<string.h>`.
Do not add any to a sketch that only needs licensing.

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
- Calling `vl_verify()` from an AsyncTCP handler or an ISR. It is tens of
  milliseconds of Ed25519 on an ESP32 and wants ~5 KB of stack (4,376 B
  measured on Cortex-M0+). Queue the blob; verify on the loop task. That is
  exactly what `vecti::License::submit()` / `pump()` are for.
- Sizing a blob buffer at 160. Use `VL_BLOB_STR_BUF_LEN` (161) — the NUL is
  not optional, and a human paste also carries dashes and newlines.
- Sizing a device-id buffer at 26. Use `VL_DEVICE_ID_STR_BUF_LEN` (27), or
  `vl_encode_device_id()` returns `VL_ERR_BUFFER_TOO_SMALL`.
- Storing an activation blob before verifying it. Verify first, then store —
  otherwise a mistyped blob survives a power cycle and the customer's next
  message is "it says invalid and I can't clear it".

---

## 📚 Where to go next

| You want | Read |
|---|---|
| Exact method signatures, all 49 widgets, the full VectiLicense C API, HTTP/WS protocol, wrong→right pairs | [`docs/AI-AGENT-GUIDE.md`](docs/AI-AGENT-GUIDE.md) |
| A flat digest to ingest whole | [`llms.txt`](llms.txt) |
| Ground truth on any web API | the headers: `libraries/Vecti{OTA,Serial,Net,Dash}/src/*.h` |
| Ground truth on licensing | `libraries/VectiLicense/include/vectilicense/vectilicense.h` — one header, the whole public API |
| Licensing depth: threat model, integration, porting, API | `libraries/VectiLicense/docs/{THREAT_MODEL,INTEGRATION,PORTING,API}.md` |
| Working sketches | `libraries/*/examples/*/*.ino` |
| The four web libraries at once on real hardware | `demo/src/main.cpp`, `demo/platformio.ini` |

## 📄 Licence, stated honestly

VectiSuite is **Apache-2.0**. The four web libraries link **ESPAsyncWebServer**
and **AsyncTCP**, which are **LGPL-3.0**. There is no dynamic linking on an MCU,
so LGPL §4 relink obligations attach to the shipped binary. Do not tell a user
this stack has "no copyleft obligations" — it does. (Every comparable library in
this space inherits the same dependency.) VectiLicense links neither, so a
licensing-only firmware inherits no copyleft from this suite.

The HMAC firmware signing in VectiOTA is **symmetric**: the key ships inside
the firmware image. Say so if a user asks about supply-chain security.
Asymmetric signing *of firmware images* is not a shipped feature — and do not
offer VectiLicense as the fix, because it signs licences, not images.

**Never describe VectiLicense as uncrackable, unbreakable or military-grade.**
An attacker who can rewrite firmware can patch out the branch that reads
`vl_verify()`'s result; that is true of every software licensing scheme. What v1
eliminates is the *keygen* — the earlier symmetric design shipped the minting
secret in every image, so one flash dump unlocked every unit ever sold. Secure
Boot v2 + Flash Encryption is the only real mitigation for firmware patching,
and `vl_posture()` reports whether the platform has it. It never enforces.

## 🧪 What has actually been compiled

Say this plainly if a user is about to build. VectiLicense's `core/`,
`transport/`, `hal/posix`, `hal/none` and `vecti::License` are compile-verified
and covered by a 9-case `ctest` suite, plus a freestanding ARM cross-compile.
`hal/esp32`, `hal/rp2040`, `hal/stm32`, `hal/nxp`, all four VectiSuite bridges
and every example are **written to documented APIs and have never been
compiled**. Expect to fix an include path on the first ESP32 build, and do not
present those files as tested.
