<!-- Horizontal magnitude bar with real end labels. The shell's `progress` card
     always reads 0-100%; this one is scaled to the card's own min/max and can
     carry a setpoint tick, which is what a limit or alarm threshold actually
     needs. (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num, clamp01 } from "$shared/lib/net.js";
  let { card, value } = $props();

  let lo  = $derived(num(card.min, 0));
  let hi  = $derived(num(card.max, 100));
  let n   = $derived(num(value, lo));
  let pct = $derived(clamp01((n - lo) / ((hi - lo) || 1)) * 100);

  // `step` doubles as the threshold marker, but only when it is a value on
  // this scale — the firmware also uses it as a slider increment, and a step
  // of 1 on a 0-1000 gauge would otherwise plant a tick against the left edge.
  let mark = $derived(num(card.step, NaN));
  let markPct = $derived(mark > lo && mark < hi ? ((mark - lo) / ((hi - lo) || 1)) * 100 : null);
  let over = $derived(markPct !== null && n >= mark);
</script>

<div class="wrap">
  <div class="track" role="progressbar" aria-valuenow={n} aria-valuemin={lo} aria-valuemax={hi}
       aria-label="{card.label || card.id}{markPct !== null ? over ? ', above threshold' : ', below threshold' : ''}">
    <span class="fill" style:width="{pct}%"></span>
    {#if markPct !== null}<span class="mark" style:left="{markPct}%"></span>{/if}
  </div>
  <div class="foot tnum">
    <span>{lo}</span>
    <strong>{n}{#if card.unit}<em>{card.unit}</em>{/if}</strong>
    <span>{hi}</span>
  </div>
  {#if markPct !== null}
    <div class="note tnum">threshold {mark}{card.unit || ""} · {over ? "reached" : "not reached"}</div>
  {/if}
</div>

<style>
.wrap { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
.track { position: relative; height: 14px; border-radius: 99px; overflow: hidden;
         background: var(--color-bg-soft); border: 1px solid var(--color-line-soft); }
.fill { display: block; height: 100%; background: var(--color-brand); transition: width .4s ease; }
.mark { position: absolute; top: -1px; bottom: -1px; width: 2px; margin-left: -1px;
        background: var(--color-ink); opacity: .7; }
.foot { display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
        font-size: 11px; color: var(--color-muted); font-family: var(--font-mono); }
.foot strong { font-size: 15px; font-weight: 650; color: var(--color-ink);
               overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.foot em { font-style: normal; font-size: .65em; color: var(--color-muted); margin-left: .2em; }
.note { font-size: 10.5px; color: var(--color-muted); font-family: var(--font-mono); }
</style>
