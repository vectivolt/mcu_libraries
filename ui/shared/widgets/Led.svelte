<!-- Indicator lamp. The word ON/OFF sits beside the lamp because a panel of
     eight LEDs read only by hue is unusable for the ~8% of technicians with a
     red-green deficiency — and unreadable in sunlight for everyone else.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value } = $props();

  // Firmware writes whatever is convenient: digitalRead() gives "1"/"0",
  // a bool serialiser gives "true"/"false". Accept both, plus "blink".
  let v = $derived(String(value ?? "").trim().toLowerCase());
  let blink = $derived(v === "blink");
  let on = $derived(blink || v === "1" || v === "true" || v === "on");
  let label = $derived(blink ? "BLINK" : on ? "ON" : "OFF");
  let tone = $derived(on ? "var(--color-ok)" : "var(--color-muted)");
</script>

<div class="led" role="img" aria-label="{card.label || card.id}: {label}">
  <span class="lamp" class:on class:blink style:--tone={tone}></span>
  <span class="txt" style:color={tone}>{label}</span>
  {#if card.unit}<span class="unit">{card.unit}</span>{/if}
</div>

<style>
.led { margin-top: auto; display: flex; align-items: center; gap: 9px; }
.lamp { width: 15px; height: 15px; flex: none; border-radius: 50%;
        background: color-mix(in srgb, var(--tone) 22%, transparent);
        border: 1px solid var(--color-line); transition: background .2s; }
.lamp.on { background: var(--tone); border-color: var(--tone);
           box-shadow: 0 0 0 4px color-mix(in srgb, var(--tone) 18%, transparent); }
/* Opacity only — no layout property is animated, so this costs nothing on a
   cheap phone even with a dozen lamps on screen. */
.lamp.blink { animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .25; } }
.txt { font-size: clamp(16px, 3vw, 20px); font-weight: 600; letter-spacing: .04em; }
.unit { font-size: 11px; color: var(--color-muted); }
</style>
