<!-- Masked text field with a show/hide toggle. Commits on blur and Enter, so a
     half-typed secret never goes on the wire. The value appears in exactly one
     place — this input — and nowhere in a label, title or console.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import Icon from "$shared/components/Icon.svelte";
  let { card, value, cmd } = $props();

  let show = $state(false);
  let text = $state("");
  let seen = null;                       // last value we took from the device

  $effect(() => {
    const v = String(value ?? "");
    if (v !== seen) { seen = v; text = v; }
  });

  const commit = () => { if (text !== String(value ?? "")) cmd(text); };
</script>

<div class="pw">
  <!-- `value=` + oninput rather than bind:value: Svelte forbids a dynamic
       `type` on a two-way bound input, and the type is the mask. -->
  <input type={show ? "text" : "password"} value={text}
         aria-label={card.label || card.id} placeholder={card.unit || ""}
         autocomplete="off" autocapitalize="off" spellcheck="false"
         oninput={(e) => (text = e.currentTarget.value)}
         onblur={commit}
         onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}/>
  <button type="button" class="eye" onclick={() => (show = !show)}
          aria-pressed={show} aria-label={show ? "Hide value" : "Show value"}>
    <Icon name={show ? "EyeOff" : "Eye"} size={15}/>
  </button>
</div>

<style>
.pw { margin-top: auto; display: flex; gap: 6px; align-items: stretch; min-width: 0; }
input { flex: 1; min-width: 0; padding: 9px 11px; font: inherit; font-size: 14px;
        letter-spacing: .02em; color: var(--color-ink); background: var(--color-panel-2);
        border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
input:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 1px; }
.eye { flex: none; width: 38px; display: grid; place-items: center; cursor: pointer;
       color: var(--color-muted); background: var(--color-panel-2);
       border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
.eye[aria-pressed="true"] { color: var(--color-brand); }
</style>
