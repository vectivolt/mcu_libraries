<!-- Press-and-HOLD: 1 while held, 0 the instant it is let go. The jog / deadman
     control ESP-DASH has no card for — its button is a single edge, so sketches
     faked a jog with two buttons and a machine that kept moving if the second
     tap was lost. (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, cmd } = $props();

  let down = $state(false);
  let name = $derived(card.label || card.id);

  function press(e) {
    if (down) return;                         // key auto-repeat, double events
    // Pointer capture is the safety feature, not a nicety: without it a finger
    // that slides off the button never delivers pointerup here and the output
    // stays energised. With it, up/cancel are guaranteed to land on us.
    try { e?.currentTarget?.setPointerCapture?.(e.pointerId); } catch { /* no capture */ }
    down = true;
    cmd("1");
  }

  // Idempotent: pointerup, lostpointercapture, blur and Escape all route here
  // and only the first one sends. Releasing twice is harmless; not releasing
  // once is a hazard.
  function release() {
    if (!down) return;
    down = false;
    cmd("0");
  }

  // A card unmounted (tab switch, layout push) while held must not leave the
  // device energised.
  $effect(() => release);

  const isAct = (k) => k === " " || k === "Enter";
</script>

<button class="mo" class:on={down} aria-pressed={down} aria-label={name}
        onpointerdown={press}
        onpointerup={release} onpointercancel={release} onpointerleave={release} onlostpointercapture={release}
        onblur={release} oncontextmenu={(e) => e.preventDefault()}
        onkeydown={(e) => { if (isAct(e.key)) { e.preventDefault(); press(); } else if (e.key === "Escape") release(); }}
        onkeyup={(e) => { if (isAct(e.key)) { e.preventDefault(); release(); } }}>
  <span class="dot" aria-hidden="true"></span>
  <span class="txt">{down ? "HOLDING" : name}</span>
</button>

<style>
/* touch-action:none — a hold that the browser decides is the start of a scroll
   fires pointercancel, and the control drops out from under the finger. */
.mo { margin-top: auto; touch-action: none; user-select: none;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 11px 12px; cursor: pointer; font: inherit; font-size: 13.5px;
      font-weight: 600; color: var(--color-ink);
      background: var(--color-panel-2);
      border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
.mo.on { color: #fff; background: var(--color-brand); border-color: var(--color-brand); }
/* Held is carried by the word HOLDING and by the filled dot, so the state
   survives both a colourblind reader and a sunlit phone screen. */
.dot { width: 9px; height: 9px; flex: none; border-radius: 50%;
       border: 2px solid currentColor; }
.mo.on .dot { background: currentColor; }
.txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
       letter-spacing: .02em; }
</style>
