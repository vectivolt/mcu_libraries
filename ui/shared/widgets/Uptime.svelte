<!-- Uptime from a seconds count. Two units only: "12d 04h" answers "did it
     reboot overnight?" at a glance, where "1051620s" does not.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num } from "$shared/lib/net.js";
  let { card, value } = $props();

  const UNITS = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]];

  let parts = $derived.by(() => {
    const s = Math.floor(num(value, NaN));
    // millis()/1000 on a device that has not booted yet, or a garbage string:
    // show nothing rather than "NaNd".
    if (!Number.isFinite(s) || s < 0) return null;
    const i = UNITS.findIndex(([, secs]) => s >= secs);
    if (i < 0) return ["0s"];                    // under a second, including 0
    const [u1, q1] = UNITS[i];
    const out = [`${Math.floor(s / q1)}${u1}`];
    const next = UNITS[i + 1];
    // Second unit zero-padded so the string keeps its width as it ticks.
    if (next) out.push(`${String(Math.floor((s % q1) / next[1])).padStart(2, "0")}${next[0]}`);
    return out;
  });
</script>

<div class="up" role="img" aria-label="{card.label || card.id}: {parts ? parts.join(' ') : 'unknown'}">
  {#if parts}
    {#each parts as p (p)}<span class="seg tnum">{p}</span>{/each}
  {:else}
    <span class="seg tnum">—</span>
  {/if}
</div>

<style>
.up { margin-top: auto; display: flex; align-items: baseline; gap: 8px; }
.seg { font-size: clamp(18px, 3.6vw, 24px); font-weight: 600; line-height: 1.1;
       color: var(--color-ink); font-family: var(--font-mono); }
</style>
