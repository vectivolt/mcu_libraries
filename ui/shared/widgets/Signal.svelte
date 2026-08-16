<!-- RSSI bars. Bars alone are a lie by rounding — -55 and -30 dBm draw the
     same four bars and behave nothing alike — so the dBm number is always
     printed next to them.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num } from "$shared/lib/net.js";
  let { card, value } = $props();

  let dbm = $derived(num(value, NaN));
  let ok  = $derived(Number.isFinite(dbm));
  // Thresholds match the ones esp_wifi reports against; anything weaker than
  // -85 dBm associates but does not usefully carry a websocket.
  let bars = $derived(!ok ? 0 : dbm >= -55 ? 4 : dbm >= -65 ? 3 : dbm >= -75 ? 2 : dbm >= -85 ? 1 : 0);
  let tone = $derived(bars >= 3 ? "var(--color-ok)" : bars === 2 ? "var(--color-warn)" : "var(--color-err)");
</script>

<div class="sig" role="img"
     aria-label="{card.label || card.id}: {ok ? `${dbm} dBm, ${bars} of 4 bars` : 'no reading'}">
  <span class="bars">
    {#each [1, 2, 3, 4] as b (b)}
      <i class="bar" class:lit={b <= bars} style:--h="{b * 25}%" style:--tone={tone}></i>
    {/each}
  </span>
  <span class="val tnum">{ok ? dbm : "—"}<em>dBm</em></span>
</div>

<style>
.sig { margin-top: auto; display: flex; align-items: flex-end; gap: 10px; }
.bars { display: flex; align-items: flex-end; gap: 3px; height: 26px; flex: none; }
.bar { width: 6px; height: var(--h); border-radius: 2px; background: var(--color-line);
       transition: background .3s; }
.bar.lit { background: var(--tone); }
.val { font-size: clamp(16px, 3.2vw, 21px); font-weight: 600; line-height: 1.1;
       color: var(--color-ink); }
.val em { font-style: normal; font-size: .55em; color: var(--color-muted); margin-left: .3em; }
</style>
