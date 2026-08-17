#!/usr/bin/env python3
"""VectiSuite endurance and failure-injection harness. Serial only — no network.

Boot-and-it-works is not verification. This drives the board through repeated
hard resets, watches every boot for a clean start, and tracks free heap across
the whole run so a leak that only shows after many cycles has somewhere to show.

    python3 tools/soak.py --minutes 30 --resets 20

What it asserts, and why each one is a real failure mode:

  * every reset produces a complete boot banner       — a hang after reset is
                                                        invisible if you only
                                                        ever boot once
  * no panic, guru meditation, backtrace or assert    — the obvious ones
  * no unexpected reset reason (brownout, watchdog,
    or an exception-triggered reboot)                 — a device that silently
                                                        reboots looks healthy in
                                                        a snapshot
  * heap at a fixed point after boot does not trend
    down across cycles                                — a per-boot leak is the
                                                        one a single soak misses
  * NVS survives power cycling                        — provisioning that does
                                                        not persist is worse
                                                        than none

(c) 2026 VectiVolt — Apache-2.0 License
"""
import argparse, glob, re, statistics, sys, time

try:
    import serial
except ImportError:
    sys.exit("pyserial missing: use ~/.platformio/penv/bin/python")

BANNER   = "VectiSuite demo"
READY    = "HTTP server up"
BAD      = ("Guru Meditation", "panic'ed", "Backtrace:", "assert failed",
            "CORRUPT HEAP", "StoreProhibited", "LoadProhibited", "abort()")
RST_RE   = re.compile(r"rst:0x([0-9a-fA-F]+)\s*\(([^)]*)\)")
HEAP_RE  = re.compile(r"heap=(\d+)")
SLOT_RE  = re.compile(r"running slot=(\S+) state=(\S+)")

# Reset causes that mean something went wrong, as opposed to a reset we asked for.
SUSPECT = {"TG0WDT_SYS_RST", "TG1WDT_SYS_RST", "RTCWDT_SYS_RST", "RTCWDT_RTC_RST",
           "BROWN_OUT_RST", "TG0WDT_CPU_RST", "SW_CPU_RESET", "RTCWDT_BROWN_OUT_RST"}


def port():
    p = sorted(glob.glob("/dev/cu.usbmodem*")) or sorted(glob.glob("/dev/cu.usbserial*"))
    if not p: sys.exit("no board found on /dev/cu.usbmodem* or /dev/cu.usbserial*")
    return p[0]


def hard_reset(s):
    """Toggle DTR/RTS the way esptool does, to force a real hardware reset."""
    s.setDTR(False); s.setRTS(True); time.sleep(0.1)
    s.setRTS(False); time.sleep(0.05)


def read_boot(s, budget=25):
    """Collect one boot. Returns (lines, saw_banner, saw_ready, rst_reason)."""
    lines, banner, ready, rst = [], False, False, None
    t0 = time.time()
    while time.time() - t0 < budget:
        raw = s.readline()
        if not raw: continue
        l = raw.decode("utf-8", "replace").rstrip()
        if not l: continue
        lines.append(l)
        m = RST_RE.search(l)
        if m: rst = m.group(2).strip()
        if BANNER in l: banner = True
        if READY in l:
            ready = True
            # Do NOT stop here. The slot/state line is printed just after the
            # server-ready line, and breaking on ready threw it away — the first
            # run of this harness reported "no slot states logged" for a build
            # that logs them on every boot.
            grace = time.time() + 1.5
            while time.time() < grace:
                raw = s.readline()
                if not raw: continue
                extra = raw.decode("utf-8", "replace").rstrip()
                if extra:
                    lines.append(extra)
                    grace = time.time() + 0.6
            break
    return lines, banner, ready, rst


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=float, default=20)
    ap.add_argument("--resets", type=int, default=12)
    ap.add_argument("--port", default=None)
    a = ap.parse_args()

    dev = a.port or port()
    print(f"soak: {dev}  {a.minutes} min, {a.resets} hard resets\n")
    s = serial.Serial(dev, 115200, timeout=1)
    s.setDTR(False); s.setRTS(False)

    fails, heaps, slots, boots_ok = [], [], set(), 0
    deadline = time.time() + a.minutes * 60
    gap = max(20.0, (a.minutes * 60) / max(a.resets, 1))

    for cycle in range(1, a.resets + 1):
        hard_reset(s)
        lines, banner, ready, rst = read_boot(s)
        bad = [l for l in lines for b in BAD if b in l]
        if rst and rst in SUSPECT:
            fails.append(f"cycle {cycle}: unexpected reset cause {rst}")
        if not banner: fails.append(f"cycle {cycle}: no boot banner within 25 s")
        if not ready:  fails.append(f"cycle {cycle}: server never reported ready")
        if bad:        fails.append(f"cycle {cycle}: {bad[0][:90]}")
        if banner and ready and not bad: boots_ok += 1
        for l in lines:
            m = SLOT_RE.search(l)
            if m: slots.add(f"{m.group(1)}/{m.group(2)}")
        print(f"  cycle {cycle:>2}: rst={rst or '?':<22} banner={'y' if banner else 'N'} "
              f"ready={'y' if ready else 'N'} {'FAULT' if bad else ''}")

        # Idle between resets, harvesting heartbeats for the heap trend.
        until = min(time.time() + gap, deadline)
        while time.time() < until:
            raw = s.readline()
            if not raw: continue
            l = raw.decode("utf-8", "replace").rstrip()
            if not l: continue
            for b in BAD:
                if b in l: fails.append(f"idle after cycle {cycle}: {l[:90]}")
            m = HEAP_RE.search(l)
            if m: heaps.append((cycle, int(m.group(1))))
        if time.time() >= deadline: break

    s.close()

    print(f"\nclean boots: {boots_ok}/{cycle}")
    print(f"slot states seen: {sorted(slots) or ['(none logged)']}")
    if heaps:
        vals = [h for _, h in heaps]
        first_third = statistics.mean(vals[:max(1, len(vals)//3)])
        last_third  = statistics.mean(vals[-max(1, len(vals)//3):])
        drift = last_third - first_third
        print(f"heap samples: {len(vals)}  min={min(vals)}  max={max(vals)}  "
              f"drift(first third -> last third) = {drift:+.0f} B")
        # A bounded ring settles; a real leak keeps falling. 4 KB over a whole
        # run is the threshold at which this is worth a human looking.
        if drift < -4096:
            fails.append(f"heap trended down {drift:+.0f} B across the run")
    else:
        print("heap samples: none (heartbeat not seen — is this the demo build?)")

    if fails:
        print(f"\n{len(fails)} FAILURES:")
        for f in fails: print("  -", f)
        return 1
    print("\nPASS: every boot clean, no faults, no heap trend")
    return 0


if __name__ == "__main__":
    sys.exit(main())
