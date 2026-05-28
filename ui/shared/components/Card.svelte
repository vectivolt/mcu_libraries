<!-- ---------------------------------------------------------------------------
  JouleSuite — generic glass-styled card. Shared across all four apps.
  Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT
--------------------------------------------------------------------------- -->
<script>
  /** @type {'default'|'success'|'warning'|'danger'|'info'|'primary'} */
  let { color = 'default', span = 3, label = '', class: klass = '', children } = $props();
  // 12-col responsive: cards collapse to 6 then 2 on narrow viewports.
  // Use $derived so re-renders react when the parent changes the span.
  let colSpan = $derived(`span ${Math.min(12, Math.max(1, span))}`);
</script>

<div
  class="joule-card group {klass}"
  data-c={color}
  style:grid-column={colSpan}
>
  {#if label}
    <div class="joule-card-label">{label}</div>
  {/if}
  <div class="joule-card-body">
    {@render children?.()}
  </div>
</div>

<style>
.joule-card {
  position: relative;
  background: var(--color-panel);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  padding: 20px;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  transition: transform .25s cubic-bezier(.3,.8,.2,1),
              box-shadow .25s ease, border-color .2s ease;
  box-shadow: var(--shadow-card);
}
.joule-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--color-brand) 30%, var(--color-line));
  box-shadow: var(--shadow-card-hover);
}
.joule-card::before {
  content: "";
  position: absolute; inset: 0 0 auto 0; height: 50%;
  border-radius: inherit;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.025), transparent 80%);
  pointer-events: none;
}
.joule-card[data-c="success"]::after { background: var(--color-ok); }
.joule-card[data-c="warning"]::after { background: var(--color-warn); }
.joule-card[data-c="danger"]::after  { background: var(--color-err); }
.joule-card[data-c="info"]::after    { background: var(--color-info); }
.joule-card[data-c="primary"]::after { background: var(--color-brand); }
.joule-card[data-c]:not([data-c="default"])::after {
  content: ""; position: absolute; left: 0; top: 16px; bottom: 16px;
  width: 3px; border-radius: 3px;
}
.joule-card-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  color: var(--color-muted);
}
.joule-card-body { display: flex; flex-direction: column; gap: 8px; }
</style>
