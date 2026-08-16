<!-- ---------------------------------------------------------------------------
  VectiSerial — wireless console SPA. Svelte 5 + Tailwind v4.
  (c) 2026 VectiVolt — MIT License
--------------------------------------------------------------------------- -->
<script>
  import { onMount } from "svelte";
  import { store, reconnectingSocket } from "$shared/lib/net.js";
  import Icon from "$shared/components/Icon.svelte";

  const LV = ["DBG", "INF", "WRN", "ERR"];
  const MAX_LINES = 4000;     // ring depth held in the tab
  // ponytail: hard ceiling — the pane shows the newest 1200 of the 4000-line
  // ring and drops the rest. Export still writes the whole filtered buffer, so
  // nothing is lost, it just is not scrollable.
  //
  // `content-visibility: auto; contain-intrinsic-size: auto 18px` on .ln was
  // tried first as the no-dependency way to render all 4000 and measured worse
  // on every axis (headless Chromium, 390px viewport, CPU throttled 6x, flick
  // scroll through the history):
  //     4000 rows + content-visibility   p50 79ms/frame, 119/120 frames late
  //     4000 rows, plain                 p50  9ms/frame,  34/120 frames late
  //     1200 rows, plain                 p50  8ms/frame,   0/120 frames late
  // and the scrollbar wandered 25% of document height as wrapped lines got
  // their real heights measured — contain-intrinsic-size can only guess one
  // number, and at phone width these lines wrap to two and three. The property
  // pays off for large expensive subtrees, not for 4000 one-line grid rows
  // where the bookkeeping costs more than the layout it skips. Cost +26 bytes
  // gzipped for that. Raising this properly needs a virtual list; the cap is
  // cheaper until someone actually asks to scroll back past 1200 lines.
  const MAX_RENDER = 1200;

  let sock       = null;
  let connected  = $state(false);
  let clients    = $state(0);
  let lines      = $state([]);
  let minLvl     = $state(0);
  let query      = $state("");
  let autoscroll = $state(true);
  let tsMode     = $state("rel");
  let hex        = $state(false);
  let fsz        = $state(Number(store.get("vecti-fs", "13")));
  let cmd        = $state("");
  let hist       = $state([]);
  let histI      = $state(-1);
  let theme      = $state(store.get("vecti-theme", "auto"));
  let liveRate   = $state(0);
  let logEl;

  // Rate meter: timestamps of recent arrivals, trimmed once a second.
  let rateBuf = [];
  // Highest sequence number already ingested. The server replays its whole
  // ring buffer on every (re)connect, so without this a single reconnect
  // appended the entire history a second time — duplicate {#each} keys, which
  // Svelte throws on, and doubled counters.
  let maxSeq = -1;

  $effect(() => document.documentElement.setAttribute("data-theme", theme));
  $effect(() => {
    document.documentElement.style.setProperty("--fs", `${fsz}px`);
    store.set("vecti-fs", String(fsz));
  });

  function cycleTheme() {
    theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    store.set("vecti-theme", theme);
  }

  function ingest(l) {
    if (l.seq <= maxSeq) return;          // already have it (history replay)
    maxSeq = l.seq;
    lines.push(l);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    rateBuf.push(Date.now());
  }

  function handle(m) {
    if (m.type === "hist") {
      if (m.title) document.title = m.title;
      if (m.brand) {
        document.documentElement.style.setProperty("--color-brand", m.brand);
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", m.brand);
      }
      for (const l of m.lines || []) ingest(l);
      queueMicrotask(scrollToEnd);
    } else if (m.type === "line") {
      ingest(m);
      requestAnimationFrame(scrollToEnd);
    } else if (m.type === "clients") {
      clients = m.n;
    }
  }

  function scrollToEnd() { if (autoscroll && logEl) logEl.scrollTop = logEl.scrollHeight; }

  let re = $derived.by(() => {
    const q = query.trim();
    if (!q) return null;
    try { return new RegExp(q, "i"); } catch { return null; }   // partial regex while typing
  });
  let visible = $derived(lines.filter(l => l.lvl >= minLvl && (!re || re.test(l.text))));
  let counts = $derived.by(() => {
    const c = [0, 0, 0, 0];
    for (const l of lines) c[l.lvl] = (c[l.lvl] || 0) + 1;
    return c;
  });

  function fmtTs(l) {
    if (tsMode === "off") return "";
    // The device sends millis() since ITS boot. There is no shared clock with
    // the browser, so an "absolute" time here would be fiction — the previous
    // build subtracted performance.now() from Date.now() and printed a
    // wall-clock that was wrong by however long the device had been up.
    const s = l.ms / 1000;
    if (tsMode === "rel") return `${s.toFixed(3)}s`;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${(s % 60).toFixed(1).padStart(4,"0")}`;
  }
  function fmtTxt(t) {
    if (!hex) return t;
    let o = "";
    for (let i = 0; i < t.length; i++) o += t.charCodeAt(i).toString(16).padStart(2, "0") + " ";
    return o.trim();
  }

  function send() {
    const text = cmd;
    if (!text) return;
    sock?.send({ type: "cmd", text });
    hist = [text, ...hist.filter(h => h !== text)].slice(0, 50);
    histI = -1; cmd = "";
  }
  function onKey(e) {
    if (e.key === "Enter") { e.preventDefault(); send(); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); if (histI < hist.length - 1) cmd = hist[++histI]; }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (histI > 0) cmd = hist[--histI]; else if (histI === 0) { histI = -1; cmd = ""; } }
  }

  function exportLog(kind) {
    const rows = visible;
    let blob;
    if (kind === "json") blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    else if (kind === "csv") {
      const csv = ["seq,ms,level,text",
        ...rows.map(l => `${l.seq},${l.ms},${LV[l.lvl]},"${String(l.text).replace(/"/g, '""')}"`)];
      blob = new Blob([csv.join("\n")], { type: "text/csv" });
    } else {
      blob = new Blob([rows.map(l => `[${fmtTs(l)}] ${LV[l.lvl]} ${l.text}`).join("\n")], { type: "text/plain" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `serial-${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.${kind}`;
    a.click();
    // Without this the blob is pinned for the lifetime of the document; a
    // few CSV exports of a 4000-line buffer is real memory on a phone.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function clearLog() { lines = []; }

  function onScroll() {
    if (!logEl) return;
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24;
    autoscroll = atBottom;      // re-arms when the user scrolls back down
  }

  onMount(() => {
    sock = reconnectingSocket("/serial/ws", {
      onMessage: handle,
      onOpen:  () => (connected = true),
      onClose: () => (connected = false),
    });

    const onDocKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
    };
    document.addEventListener("keydown", onDocKey);

    const rateTimer = setInterval(() => {
      const cutoff = Date.now() - 1000;
      rateBuf = rateBuf.filter(t => t > cutoff);
      liveRate = rateBuf.length;
    }, 1000);

    // Every one of these was previously left running for the life of the tab.
    return () => {
      document.removeEventListener("keydown", onDocKey);
      clearInterval(rateTimer);
      sock?.close();
    };
  });

  const STATS = $derived([
    ["dbg", counts[0]], ["inf", counts[1]], ["wrn", counts[2]], ["err", counts[3]],
    ["rate", `${liveRate}/s`], ["shown", visible.length],
  ]);
</script>

<div class="shell">
  <header class="hdr">
    <span class="mark" aria-hidden="true"><Icon name="Terminal" size={14} strokeWidth={2.4}/></span>
    <div class="ident">
      <h1>VectiSerial</h1>
      <p class="tnum">{clients} client{clients === 1 ? "" : "s"} connected</p>
    </div>
    <span class="pill" data-tone={connected ? "ok" : "muted"} aria-live="polite">
      <i aria-hidden="true"></i>{connected ? "Online" : "Reconnecting"}
    </span>
    <button class="icon-btn" onclick={cycleTheme} aria-label="Theme: {theme}. Click to change.">
      {#if theme === "light"}<Icon name="Sun" size={16}/>{:else if theme === "dark"}<Icon name="Moon" size={16}/>{:else}<Icon name="Monitor" size={16}/>{/if}
    </button>
  </header>

  <div class="bar">
    <div class="find">
      <Icon name="Search" size={13} aria-hidden="true"/>
      <input id="search" bind:value={query} type="search"
             aria-label="Filter lines (regular expression)"
             placeholder="filter — regex ok · press /"/>
    </div>

    <label class="sr-only" for="lvl">Minimum level</label>
    <select id="lvl" bind:value={minLvl}>
      <option value={0}>DEBUG+</option><option value={1}>INFO+</option>
      <option value={2}>WARN+</option><option value={3}>ERROR</option>
    </select>

    <button class="chip" class:on={autoscroll} onclick={() => (autoscroll = !autoscroll)}
            aria-pressed={autoscroll}>
      {#if autoscroll}<Icon name="Play" size={12}/> Follow{:else}<Icon name="Pause" size={12}/> Hold{/if}
    </button>
    <button class="chip" onclick={() => (tsMode = tsMode === "rel" ? "uptime" : tsMode === "uptime" ? "off" : "rel")}>
      time: {tsMode}
    </button>
    <button class="chip" class:on={hex} onclick={() => (hex = !hex)} aria-pressed={hex}>
      {hex ? "hex" : "text"}
    </button>

    <label class="sr-only" for="fs">Font size</label>
    <select id="fs" bind:value={fsz}>
      <option value={12}>12px</option><option value={13}>13px</option>
      <option value={14}>14px</option><option value={16}>16px</option>
    </select>

    <label class="sr-only" for="exp">Export</label>
    <select id="exp" onchange={(e) => { const v = e.currentTarget.value; if (v) { exportLog(v); e.currentTarget.value = ""; } }}>
      <option value="">export…</option><option value="txt">Text</option>
      <option value="json">JSON</option><option value="csv">CSV</option>
    </select>

    <button class="chip danger" onclick={clearLog}><Icon name="Eraser" size={12}/> Clear</button>

    <span class="spacer"></span>

    <div class="stats">
      {#each STATS as [k, v] (k)}
        <span class="stat">{k}<b class="tnum">{v}</b></span>
      {/each}
    </div>
  </div>

  <!-- The scroll container carries tabindex so the log is reachable and
       scrollable by keyboard (WCAG 2.1.1); the live-region role sits on the
       inner list, because a `log` role is non-interactive and must not itself
       be in the tab order. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- Intentional: WCAG 2.1.1 requires a scrollable region to be keyboard
       reachable, and the rule does not model that case. Removing tabindex
       would make the log unscrollable without a pointer. -->
  <section class="log" bind:this={logEl} onscroll={onScroll} tabindex="0"
           aria-label="Device log, scrollable">
   <div role="log" aria-live="off">
    {#each visible.slice(-MAX_RENDER) as l (l.seq)}
      <div class="ln" data-l={l.lvl} style:grid-template-columns={tsMode === "off" ? "42px 1fr" : "78px 42px 1fr"}>
        {#if tsMode !== "off"}<span class="ts tnum">{fmtTs(l)}</span>{/if}
        <span class="lv">{LV[l.lvl]}</span>
        <span class="tx">{fmtTxt(l.text)}</span>
      </div>
    {:else}
      <p class="empty">Waiting for output…</p>
    {/each}
   </div>
  </section>

  <form class="cmd" onsubmit={(e) => { e.preventDefault(); send(); }}>
    <label class="sr-only" for="cmdin">Command</label>
    <input id="cmdin" bind:value={cmd} onkeydown={onKey} autocomplete="off" spellcheck="false"
           placeholder="command — Enter to send · ↑/↓ history · / to filter"/>
    <button class="btn" type="submit" disabled={!cmd}><Icon name="Send" size={14} strokeWidth={2.4}/> Send</button>
  </form>
</div>

<style>
.shell { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }

.hdr { display: flex; align-items: center; gap: 12px; padding: 0 16px; height: 56px; flex: none;
       border-bottom: 1px solid var(--color-line); background: var(--color-bg); }
.mark { display: grid; place-items: center; width: 30px; height: 30px; flex: none;
        border-radius: 9px; color: #fff; background: var(--grad); }
.ident { min-width: 0; flex: 1; }
.ident h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.01em; }
.ident p  { margin: 0; font-size: 12px; color: var(--color-muted); font-family: var(--font-mono); }

.pill { display: inline-flex; align-items: center; gap: 6px; flex: none;
        padding: 3px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600;
        border: 1px solid var(--color-line); color: var(--color-muted); }
.pill i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.pill[data-tone="ok"] { color: var(--color-ok); }

.icon-btn { display: grid; place-items: center; width: 32px; height: 32px; flex: none;
            border: 0; background: none; color: var(--color-muted); cursor: pointer; border-radius: 8px; }
.icon-btn:hover { color: var(--color-ink); background: var(--color-bg-soft); }

.bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: none;
       padding: 8px 14px; border-bottom: 1px solid var(--color-line); background: var(--color-bg); }
.find { position: relative; display: flex; align-items: center; color: var(--color-muted); }
.find :global(svg) { position: absolute; left: 8px; pointer-events: none; }
.find input { width: 210px; padding: 6px 10px 6px 26px; }

.bar input, .bar select {
  font: inherit; font-size: 12.5px; color: var(--color-ink);
  background: var(--color-panel); border: 1px solid var(--color-line);
  border-radius: var(--radius-ctl); padding: 6px 8px; cursor: pointer;
}
.bar input { cursor: text; }

.chip { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px;
        font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
        color: var(--color-ink-2); background: var(--color-panel);
        border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
.chip:hover { border-color: var(--color-brand); color: var(--color-brand); }
.chip.on { border-color: var(--color-brand); color: var(--color-brand);
           background: color-mix(in srgb, var(--color-brand) 8%, transparent); }
.chip.danger:hover { border-color: var(--color-err); color: var(--color-err); }

.spacer { flex: 1; min-width: 8px; }
.stats { display: flex; gap: 5px; flex-wrap: wrap; }
.stat { display: inline-flex; gap: 5px; padding: 3px 8px; border-radius: 99px;
        font-family: var(--font-mono); font-size: 10.5px; color: var(--color-muted);
        border: 1px solid var(--color-line-soft); background: var(--color-panel); }
.stat b { color: var(--color-ink); font-weight: 600; }

.log { flex: 1; overflow-y: auto; padding: 6px 10px;
       font-family: var(--font-mono); font-size: var(--fs, 13px); line-height: 1.55;
       background: var(--color-bg-soft); }
.log:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -2px; }
/* Deliberately no content-visibility here — see MAX_RENDER for the numbers. */
.ln { display: grid; align-items: baseline; gap: 10px; padding: 1px 6px; border-radius: 4px; }
.ln:hover { background: color-mix(in srgb, var(--color-ink) 5%, transparent); }
.ts { font-size: .82em; color: var(--color-muted); }
.lv { font-size: .74em; font-weight: 700; letter-spacing: .06em; text-align: center;
      padding: 1px 0; border-radius: 3px; }
.ln[data-l="0"] .lv { color: var(--color-muted);  background: color-mix(in srgb, var(--color-muted) 16%, transparent); }
.ln[data-l="1"] .lv { color: var(--color-ok);     background: color-mix(in srgb, var(--color-ok)   16%, transparent); }
.ln[data-l="2"] .lv { color: var(--color-warn);   background: color-mix(in srgb, var(--color-warn) 20%, transparent); }
.ln[data-l="3"] .lv { color: var(--color-err);    background: color-mix(in srgb, var(--color-err)  20%, transparent); }
.ln[data-l="3"] .tx { color: var(--color-err); }
.ln[data-l="2"] .tx { color: var(--color-warn); }
.tx { color: var(--color-ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.empty { color: var(--color-muted); padding: 16px 6px; font-size: 13px; }

.cmd { display: flex; align-items: center; gap: 8px; flex: none; padding: 10px 14px;
       border-top: 1px solid var(--color-line); background: var(--color-bg);
       padding-bottom: max(10px, env(safe-area-inset-bottom)); }
.cmd input { flex: 1; min-width: 0; padding: 9px 12px; font: inherit; font-size: 13px;
             font-family: var(--font-mono); color: var(--color-ink);
             background: var(--color-panel); border: 1px solid var(--color-line);
             border-radius: var(--radius-ctl); }
.btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 15px; flex: none;
       font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; color: #fff;
       background: var(--color-brand); border: 1px solid var(--color-brand);
       border-radius: var(--radius-ctl); }
.btn:hover:not(:disabled) { filter: brightness(1.07); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
</style>
