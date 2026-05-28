<!-- ---------------------------------------------------------------------------
  JouleSuite — generic glass-styled card. Shared across all four apps.
  Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT
--------------------------------------------------------------------------- -->
<script>
  /** @type {'default'|'success'|'warning'|'danger'|'info'|'primary'} */
  let { color = 'default',
        span = 3,
        label = '',
        Icon = null,       // optional Lucide component to show in the top-right corner
        class: klass = '',
        children } = $props();
  let colSpan = $derived(`span ${Math.min(12, Math.max(1, span))}`);

  // Semantic color → CSS var lookup for the icon tint.
  let iconVar = $derived(
    color === "success" ? "--color-ok"
    : color === "warning" ? "--color-warn"
    : color === "danger"  ? "--color-err"
    : color === "info"    ? "--color-info"
    : color === "primary" ? "--color-brand"
    : "--color-muted"
  );
</script>

<div class="joule-card group {klass}" data-c={color} style:grid-column={colSpan}>
  {#if label || Icon}
    <div class="joule-card-head">
      {#if label}<div class="joule-card-label">{label}</div>{/if}
      {#if Icon}
        <div class="joule-card-icon" style:color={`color-mix(in srgb, var(${iconVar}) 55%, transparent)`}>
          <Icon size={16} strokeWidth={2.2}/>
        </div>
      {/if}
    </div>
  {/if}
  <div class="joule-card-body">{@render children?.()}</div>
</div>

<style>
.joule-card {
  position: relative;
  background: var(--color-panel);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  padding: 20px;
  min-height: 124px;
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
/* Top sheen — gives the dark glass-morphism a subtle inner highlight. */
.joule-card::before {
  content: "";
  position: absolute; inset: 0 0 auto 0; height: 50%;
  border-radius: inherit;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.025), transparent 80%);
  pointer-events: none;
}
/* Left semantic accent strip, 70% opacity to match Stitch's polish. */
.joule-card[data-c]:not([data-c="default"])::after {
  content: ""; position: absolute; left: 0; top: 16px; bottom: 16px;
  width: 3px; border-radius: 3px;
  opacity: .7;
}
.joule-card[data-c="success"]::after { background: var(--color-ok); }
.joule-card[data-c="warning"]::after { background: var(--color-warn); }
.joule-card[data-c="danger"]::after  { background: var(--color-err); }
.joule-card[data-c="info"]::after    { background: var(--color-info); }
.joule-card[data-c="primary"]::after { background: var(--color-brand); }

.joule-card-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 2px;
}
.joule-card-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 1.6px;
  font-weight: 600;
  color: var(--color-muted);
}
.joule-card-icon {
  display: inline-grid;
  place-items: center;
  width: 16px; height: 16px;
}
.joule-card-body { display: flex; flex-direction: column; gap: 8px; flex: 1; }
</style>
