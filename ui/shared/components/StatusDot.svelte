<script>
  let { state = 'ok', text = '' } = $props();
  // state: 'ok' | 'warn' | 'err' | 'muted'
</script>
<div class="joule-status" data-s={state}>
  <span class="dot"></span>
  {#if text}<span>{text}</span>{/if}
</div>

<style>
.joule-status { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13.5px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-muted); }
.joule-status[data-s="ok"]   .dot { background: var(--color-ok);   box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-ok)   18%, transparent); animation: pulse 2.4s ease-in-out infinite; }
.joule-status[data-s="warn"] .dot { background: var(--color-warn); box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-warn) 18%, transparent); }
.joule-status[data-s="err"]  .dot { background: var(--color-err);  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-err)  18%, transparent); }
@keyframes pulse {
  0%,100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-ok) 18%, transparent); }
  50%     { box-shadow: 0 0 0 7px color-mix(in srgb, var(--color-ok)  6%, transparent); }
}
</style>
