<!-- Two-stage button for the actions that cannot be undone — E-STOP, factory
     reset, erase. ESP-DASH's button card fires on the first tap, which on a
     phone carried in a pocket is one accidental brush away from a stopped
     machine. This one arms, shows a 3 s window, and disarms itself.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import Icon from "$shared/components/Icon.svelte";
  let { card, cmd } = $props();

  const WINDOW = 3;             // seconds the armed state stays live
  let left = $state(0);         // seconds remaining; 0 means disarmed
  let timer = null;

  function disarm() { clearInterval(timer); timer = null; left = 0; }

  function press() {
    if (left > 0) { disarm(); cmd("1"); return; }   // second click: fire
    left = WINDOW;
    timer = setInterval(() => { if (--left <= 0) disarm(); }, 1000);
  }

  // A card can be removed from the layout mid-countdown; a live interval
  // holding a reference to a dead component keeps ticking forever.
  $effect(() => disarm);

  // Tone follows the card's semantic colour: a Danger card must not render in
  // the same brand green as a benign action.
  let tone = $derived(card.color || "default");
  let name = $derived(card.label || card.id);
</script>

<button class="cb" data-tone={tone} data-armed={left > 0}
        aria-label={left > 0 ? `Confirm ${name}, ${left} seconds left` : name}
        onclick={press} onblur={disarm}
        onkeydown={(e) => { if (e.key === "Escape") disarm(); }}>
  <Icon name={left > 0 ? "ShieldCheck" : "Power"} size={15}/>
  <!-- The state is in the text, never in the colour alone, and it is live so
       a screen reader hears the arm without having to re-focus the button. -->
  <span class="txt" aria-live="polite">{left > 0 ? `Confirm? ${left}s` : name}</span>
  <span class="fuse" style:width="{(left / WINDOW) * 100}%"></span>
</button>

<style>
.cb { position: relative; overflow: hidden; margin-top: auto;
      display: flex; align-items: center; justify-content: center; gap: 7px;
      padding: 9px 12px; cursor: pointer; font: inherit; font-size: 13.5px;
      font-weight: 600; color: #fff;
      background: var(--tone, var(--color-brand));
      border: 1px solid var(--tone, var(--color-brand));
      border-radius: var(--radius-ctl); }
.cb[data-tone="danger"]  { --tone: var(--color-err); }
.cb[data-tone="warning"] { --tone: var(--color-warn); }
.cb[data-tone="success"] { --tone: var(--color-ok); }
.cb[data-tone="info"]    { --tone: var(--color-info); }
.cb:hover  { filter: brightness(1.07); }
.cb:active { filter: brightness(.94); }
/* Armed reads as an outlined "are you sure" state, not merely a darker fill —
   the shape changes, so the arming is visible without colour perception. */
.cb[data-armed="true"] { background: transparent; color: var(--tone, var(--color-brand));
                         border-style: dashed; }
.txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Countdown bar. One 1 s tick drives it; CSS does the in-between. */
.fuse { position: absolute; left: 0; bottom: 0; height: 3px;
        background: currentColor; opacity: .7; transition: width 1s linear; }
</style>
