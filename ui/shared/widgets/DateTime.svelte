<!-- Native datetime-local, on the wire as Unix epoch SECONDS (the device's
     time_t).

     TIMEZONE, and it is a real footgun: <input type="datetime-local"> is a
     naive wall clock with no zone, so the conversion here uses the BROWSER's
     local zone in both directions. That is right only when the device's clock
     is also set to the technician's local time — the usual case for an ESP32
     with a configTime() offset, and wrong for one left on UTC, which will then
     read off by the browser's offset. There is nothing in the payload to
     disambiguate; if a sketch needs UTC it should send UTC and say so in the
     card label. (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { num } from "$shared/lib/net.js";
  let { card, value, cmd } = $props();

  const pad = (n) => String(n).padStart(2, "0");

  // epoch seconds → "YYYY-MM-DDTHH:MM". Empty for anything unparseable, which
  // renders as a blank field rather than 1970 or "Invalid Date".
  let field = $derived.by(() => {
    const s = num(value, NaN);
    if (!Number.isFinite(s)) return "";
    const d = new Date(s * 1000);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  function change(e) {
    const t = new Date(e.currentTarget.value).getTime();   // parsed as local time
    if (Number.isNaN(t)) return;                           // cleared field: send nothing
    cmd(String(Math.floor(t / 1000)));
  }
</script>

<label class="dt">
  <span class="sr-only">{card.label || card.id}</span>
  <input type="datetime-local" value={field} onchange={change}
         aria-label={card.label || card.id}/>
</label>

<style>
.dt { margin-top: auto; display: block; }
input { width: 100%; padding: 8px 10px; font: inherit; font-size: 13.5px;
        font-family: var(--font-mono); color: var(--color-ink);
        background: var(--color-panel-2); border: 1px solid var(--color-line);
        border-radius: var(--radius-ctl); }
input:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 1px; }
</style>
