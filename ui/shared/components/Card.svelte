<!-- ---------------------------------------------------------------------------
  VectiSuite — panel card, shared across all four apps.

  Deliberately flat: no lift-on-hover, no backdrop blur, no coloured glow.
  These pages are instrument panels, not marketing sites — a card that moves
  when the pointer crosses it makes a 30-widget dashboard feel unstable, and
  hover states are dead weight on the phone where most of this gets read.
  Status is carried by the accent rail and the value, never by decoration.

  (c) 2026 VectiVolt — Apache-2.0 License
--------------------------------------------------------------------------- -->
<script>
  import Icon from './Icon.svelte';

  /** @type {'default'|'success'|'warning'|'danger'|'info'|'primary'} */
  let { color = 'default',
        span = 3,
        label = '',
        icon = null,        // icon NAME from shared/icons.js, rendered in the corner
        class: klass = '',
        children } = $props();

  let colSpan = $derived(`span ${Math.min(12, Math.max(1, span))}`);

  let accent = $derived(
    color === "success" ? "var(--color-ok)"
    : color === "warning" ? "var(--color-warn)"
    : color === "danger"  ? "var(--color-err)"
    : color === "info"    ? "var(--color-info)"
    : color === "primary" ? "var(--color-brand)"
    : "var(--color-muted)"
  );
</script>

<section class="vecti-card {klass}"
         data-accent={color !== 'default'}
         style:grid-column={colSpan}
         style:--accent={accent}>
  {#if label || icon}
    <header class="vecti-card-head">
      {#if label}<h2 class="vecti-card-label">{label}</h2>{/if}
      {#if icon}
        <span class="vecti-card-icon"><Icon name={icon} size={15} strokeWidth={2}/></span>
      {/if}
    </header>
  {/if}
  <div class="vecti-card-body">{@render children?.()}</div>
</section>

<style>
.vecti-card {
  position: relative;
  background: var(--color-panel);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  padding: 13px 15px;
  /* Enough to align a row of KPI cards, not so much that a one-line status
     widget floats in a pool of empty panel. */
  min-height: 92px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: var(--shadow-card);
  /* Cards sit in a 12-col grid; without this a long unbroken value string
     (a MAC, a base64 blob) forces the whole row wider than the viewport. */
  min-width: 0;
  /* Lets widgets adapt to the card's own width rather than the viewport's —
     a 3-col card on desktop is narrower than a 12-col card on a phone. */
  container-type: inline-size;
}

/* Accent rail. Inset rather than full-bleed so it reads as a status marker
   and not as a border, and so adjacent cards don't form a stripe pattern. */
.vecti-card[data-accent="true"]::before {
  content: "";
  position: absolute; left: 0; top: 14px; bottom: 14px;
  width: 3px;
  border-top-right-radius: 3px; border-bottom-right-radius: 3px;
  background: var(--accent);
}

.vecti-card-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.vecti-card-label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-muted);
  /* A long label truncates rather than wrapping to three lines and shoving
     the value out of the card. */
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.vecti-card-icon {
  display: inline-grid; place-items: center;
  flex: none;
  color: var(--accent);
  opacity: .75;
}
.vecti-card-body {
  display: flex; flex-direction: column; gap: 8px;
  flex: 1; min-width: 0;
}
</style>
