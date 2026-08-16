<!-- Scannable QR code from whatever the sketch puts in `value` — a
     `WIFI:S:Rig-7;T:WPA;P:hunter2;;` join string so a tech onboards the device
     by pointing a phone at the card, or `http://192.168.4.1/dash` to open this
     dashboard on that phone. Nothing else in this category ships one.
     (c) 2026 VectiVolt — Apache-2.0 License -->
<script>
  import { encodeQR } from "$shared/lib/qr.js";
  let { card, value } = $props();

  // `opts` doubles as the ECC level here ("L".."H"); M is the sane default —
  // L saves a version on long URLs, H survives a scuffed sticker.
  let sym = $derived(value ? encodeQR(value, String(card.opts || "M").trim()) : null);

  // One <path> of merged horizontal runs, not one <rect> per module: a v4
  // symbol is ~1200 dark modules, and 1200 elements is a real scroll cost on
  // the cheap Android a tech is holding.
  let d = $derived.by(() => {
    if (!sym) return "";
    const { size, modules } = sym;
    let out = "";
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!modules[y * size + x]) continue;
        let w = 1;
        while (x + w < size && modules[y * size + x + w]) w++;
        out += `M${x + 4} ${y + 4}h${w}v1h-${w}z`;
        x += w - 1;
      }
    }
    return out;
  });

  // Name the network rather than reading a raw WIFI: blob out loud. The full
  // payload is below in text either way.
  let ssid = $derived(/^WIFI:.*?S:((?:\\.|[^;])*)/.exec(value || "")?.[1]);
  let label = $derived(
    `${card.label || card.id}: QR code for ${ssid ? `Wi-Fi network ${ssid}` : value}`
  );
</script>

<div class="qr">
  {#if !value}
    <p class="msg">no code set</p>
  {:else if !sym}
    <!-- Never a blank card: say why, and how much too long it is. -->
    <p class="msg">payload too long to encode ({value.length} chars)</p>
  {:else}
    <svg viewBox="0 0 {sym.size + 8} {sym.size + 8}" role="img" aria-label={label}
         shape-rendering="crispEdges">
      <!-- The 4-module quiet zone is part of the symbol, not padding: a
           scanner that cannot find it will not lock on. -->
      <rect width="100%" height="100%" fill="var(--qr-light)"/>
      <path {d} fill="var(--qr-dark)"/>
    </svg>
  {/if}
  {#if value}
    <!-- Accessibility fallback, and the only way to use this over a screen
         share or a printout. Selectable so it can be copied. -->
    <p class="txt">{value}</p>
  {/if}
</div>

<style>
/* Contrast direction is deliberate. The decoding algorithm in ISO 18004
   assumes dark-on-light; phone cameras cope with an inverted symbol but plenty
   of handheld and industrial scanners do not, so the symbol must NOT follow
   the theme. In light theme ink-on-panel is already dark-on-light; in dark
   theme the two tokens swap roles, which keeps the same 16:1 contrast and the
   same polarity — the card goes dark around a symbol that stays a light plate
   with dark modules. Only theme tokens are used, per the widget contract. */
.qr { --qr-dark: var(--color-ink); --qr-light: var(--color-panel);
      margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 7px; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .qr { --qr-dark: var(--color-panel); --qr-light: var(--color-ink); }
}
:root[data-theme="dark"] .qr { --qr-dark: var(--color-panel); --qr-light: var(--color-ink); }

/* Sized by the card, capped so a wide card does not blow it up past what a
   phone camera needs. A 1px ring keeps the white plate off a white card. */
svg { width: 100%; max-width: 190px; aspect-ratio: 1; display: block;
      border-radius: 4px; box-shadow: 0 0 0 1px var(--color-line); }
.txt { margin: 0; max-width: 100%; font-family: var(--font-mono); font-size: 10.5px;
       line-height: 1.35; color: var(--color-muted); text-align: center;
       overflow-wrap: anywhere; user-select: all; }
.msg { margin: auto 0 0; font-size: 12px; color: var(--color-muted); }
@container (max-width: 150px) {
  .txt { font-size: 9.5px; }
}
</style>
