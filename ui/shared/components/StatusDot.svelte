<!-- ---------------------------------------------------------------------------
  VectiSuite — status pill.

  The dot is never the only carrier of meaning: the text label always states
  the status too, so the widget still works for a colour-blind operator and
  for a screen reader. Only "ok" pulses — an animated error dot competing
  with an animated ok dot tells you nothing at a glance.

  (c) 2026 VectiVolt — MIT License
--------------------------------------------------------------------------- -->
<script>
  /** @type {'ok'|'warn'|'err'|'muted'} */
  let { state = 'ok', text = '' } = $props();

  const WORD = { ok: 'healthy', warn: 'warning', err: 'fault', muted: 'unknown' };
</script>

<div class="vecti-status" data-s={state}>
  <span class="dot" aria-hidden="true"></span>
  <span class="txt">{text || WORD[state]}</span>
  <!-- Spoken status, so the meaning does not depend on seeing the colour. -->
  <span class="sr-only">— {WORD[state]}</span>
</div>

<style>
.vecti-status {
  display: inline-flex; align-items: center; gap: 8px;
  font-weight: 600; font-size: 14px;
  color: var(--color-ink);
  min-width: 0;
}
.txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot {
  flex: none;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-muted);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-muted) 20%, transparent);
}
.vecti-status[data-s="ok"]   .dot { background: var(--color-ok);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-ok) 20%, transparent);
  animation: vecti-pulse 2.4s ease-in-out infinite; }
.vecti-status[data-s="warn"] .dot { background: var(--color-warn);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-warn) 22%, transparent); }
.vecti-status[data-s="err"]  .dot { background: var(--color-err);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-err) 22%, transparent); }

@keyframes vecti-pulse {
  0%,100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-ok) 20%, transparent); }
  50%     { box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-ok)  5%, transparent); }
}
</style>
