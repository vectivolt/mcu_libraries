<!-- Rolling log pane, newest at the bottom. Follows the tail only while the
     reader is already at the bottom — auto-scrolling someone who has scrolled
     up to read the line that broke is the classic log-widget sin.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  let { card, value } = $props();

  let lines = $derived.by(() => {
    const raw = String(value ?? "");
    if (!raw.trim()) return [];
    if (raw.trimStart()[0] === "[") {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) return p.map((l) => String(l));
      } catch { /* half a frame from a rebooting device — treat as text */ }
    }
    return raw.split("\n").filter((l) => l !== "");
  });

  let box = $state(null);
  let pinned = $state(true);

  $effect(() => {
    lines.length;                       // re-run when the log grows
    if (box && pinned) box.scrollTop = box.scrollHeight;
  });

  function track() {
    if (box) pinned = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
  }
</script>

<!-- Focusable on purpose: a scroll container that only a mouse can reach fails
     WCAG 2.1.1. The lint rule does not know about the keyboard-scroll case. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="log" bind:this={box} onscroll={track}
     tabindex="0" role="log" aria-label={card.label || card.id}>
  {#if lines.length}
    {#each lines as l, i (i)}<div class="ln">{l}</div>{/each}
  {:else}
    <div class="ln empty">— no output —</div>
  {/if}
</div>

<style>
/* Bounded height + `overscroll-behavior: contain` so a flick inside the log
   never runs on into the page behind it. */
.log { margin-top: auto; max-height: 150px; overflow-y: auto; overscroll-behavior: contain;
       background: var(--color-bg-soft); border: 1px solid var(--color-line);
       border-radius: var(--radius-ctl); padding: 6px 8px; min-width: 0; }
.log:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 1px; }
.ln { font-family: var(--font-mono); font-size: 11.5px; line-height: 1.5;
      color: var(--color-ink-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.empty { color: var(--color-muted); }
</style>
