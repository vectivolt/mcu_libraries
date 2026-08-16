<!-- Key/value diagnostics table. The card every competing dashboard forces you
     to fake with a dozen one-line text cards: heap, SSID, MAC, build hash, all
     in one place, scrolling inside the card instead of stretching it.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value } = $props();

  let rows = $derived.by(() => {
    const raw = String(value ?? "").trim();
    if (!raw) return [];
    // Preferred wire form is JSON [["Key","Val"],…]. A sketch short on RAM can
    // send "k=v;k=v" instead — cheaper to build with String concatenation on
    // the device than a JSON document.
    if (raw[0] === "[") {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p))
          return p.map((r) => Array.isArray(r)
            ? [String(r[0] ?? ""), String(r[1] ?? "")]
            : [String(r), ""]);
      } catch { /* malformed frame — fall through, never throw */ }
    }
    return raw.split(";").filter((s) => s.trim()).map((pair) => {
      const i = pair.indexOf("=");
      return i < 0 ? [pair.trim(), ""] : [pair.slice(0, i).trim(), pair.slice(i + 1).trim()];
    });
  });
</script>

<!-- Focusable on purpose: the list scrolls, and a scroll container that only a
     mouse can reach fails WCAG 2.1.1. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="tbl" tabindex="0" role="group" aria-label={card.label || card.id}>
  {#if rows.length}
    <dl>
      {#each rows as [k, v], i (i)}
        <div class="row">
          <dt title={k}>{k}</dt>
          <dd class="tnum" title={v}>{v || "—"}</dd>
        </div>
      {/each}
    </dl>
  {:else}
    <p class="empty">— no data —</p>
  {/if}
</div>

<style>
/* ~6 rows then scroll: the card keeps its grid height whatever the device
   sends, and `contain` stops a flick inside the list scrolling the page. */
.tbl { margin-top: auto; max-height: 168px; overflow-y: auto; overscroll-behavior: contain;
       min-width: 0; }
.tbl:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
dl { margin: 0; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
       gap: 10px; align-items: baseline; padding: 5px 0;
       border-bottom: 1px solid var(--color-line-soft); }
.row:last-child { border-bottom: 0; }
dt { margin: 0; font-size: 12px; color: var(--color-muted);
     overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
dd { margin: 0; font-size: 12.5px; font-family: var(--font-mono); color: var(--color-ink);
     text-align: right; overflow-wrap: anywhere; }
.empty { margin: 0; font-size: 12px; color: var(--color-muted); }
/* On a narrow card the two columns stop fitting; stack instead of ellipsing
   a MAC address down to nothing. */
@container (max-width: 190px) {
  .row { grid-template-columns: 1fr; gap: 0; }
  dd { text-align: left; }
}
</style>
