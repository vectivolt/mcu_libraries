<!-- ---------------------------------------------------------------------------
  JouleSerial — wireless console SPA. Svelte 5 + Tailwind v4.
  Full-bleed terminal pane, JetBrains Mono, ANSI-tinted log lines, regex
  search, hex/ascii toggle, exports, command history.
  Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT
--------------------------------------------------------------------------- -->
<script>
  import { onMount, onDestroy, tick } from "svelte";
  import { Terminal, Send, Pause, Play, Eraser, Download, Search } from "lucide-svelte";

  let ws         = $state(null);
  let connected  = $state(false);
  let clients    = $state(0);
  let lines      = $state([]);
  let counts     = $state({ 0:0, 1:0, 2:0, 3:0 });
  let rateBuf    = $state([]);
  let minLvl     = $state(1);
  let query      = $state("");
  let autoscroll = $state(true);
  let tsMode     = $state("rel");
  let hex        = $state(false);
  let fsz        = $state(parseInt(localStorage.getItem("joule-fs") || "13"));
  let cmd        = $state("");
  let hist       = $state([]);
  let histI      = $state(-1);
  let theme      = $state(localStorage.getItem("joule-theme") || "dark");
  let logEl;

  $effect(() => document.documentElement.setAttribute("data-theme", theme));
  $effect(() => { document.documentElement.style.setProperty("--fs", fsz + "px"); localStorage.setItem("joule-fs", String(fsz)); });

  function cycleTheme(){ theme = theme==="dark" ? "light" : theme==="light" ? "auto" : "dark"; localStorage.setItem("joule-theme", theme); }

  function open() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host + "/serial/ws");
    ws.onopen  = () => connected = true;
    ws.onclose = () => { connected = false; setTimeout(open, 1500); };
    ws.onmessage = e => { try { handle(JSON.parse(e.data)); } catch {} };
  }
  function handle(m) {
    if (m.type === "hist") {
      if (m.title) document.title = m.title;
      if (m.brand) {
        document.documentElement.style.setProperty("--color-brand", m.brand);
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", m.brand);
      }
      for (const l of m.lines) ingest(l);
    } else if (m.type === "line") {
      ingest(m); requestAnimationFrame(scrollToEnd);
    } else if (m.type === "clients") {
      clients = m.n;
    }
  }
  function ingest(l){
    lines = [...lines, l]; if (lines.length > 6000) lines = lines.slice(-6000);
    counts = { ...counts, [l.lvl]: (counts[l.lvl] || 0) + 1 };
    rateBuf = [...rateBuf, Date.now()];
  }
  function scrollToEnd() { if (autoscroll && logEl) logEl.scrollTop = logEl.scrollHeight; }

  const LV = ["DBG", "INF", "WRN", "ERR"];
  const LC = ["dbg", "inf", "wrn", "err"];

  let re = $derived.by(() => { if (!query.trim()) return null; try { return new RegExp(query, "i"); } catch { return null; } });
  let visible = $derived(lines.filter(l => l.lvl >= minLvl && (!re || re.test(l.text))));
  let liveRate = $state(0);
  setInterval(() => {
    const cutoff = Date.now() - 1000;
    rateBuf = rateBuf.filter(t => t > cutoff);
    liveRate = rateBuf.length;
  }, 1000);

  function fmtTs(l){
    if (tsMode === "off") return "";
    if (tsMode === "rel") return (l.ms / 1000).toFixed(3) + "s";
    return new Date(Date.now() - (performance.now() - l.ms)).toISOString().substr(11, 12);
  }
  function fmtTxt(t){ if (!hex) return t; let o=""; for (let i=0;i<t.length;i++) o += t.charCodeAt(i).toString(16).padStart(2,"0") + " "; return o.trim(); }

  function send() {
    if (!cmd) return;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "cmd", text: cmd }));
    hist = [cmd, ...hist].slice(0, 50); histI = -1; cmd = "";
  }
  function onKey(e){
    if (e.key === "Enter") send();
    else if (e.key === "ArrowUp")   { if (histI < hist.length - 1) { histI++; cmd = hist[histI]; } }
    else if (e.key === "ArrowDown") { if (histI > 0) { histI--; cmd = hist[histI]; } else if (histI === 0) { histI = -1; cmd = ""; } }
  }

  function exportLog(kind) {
    let blob;
    if (kind === "json") blob = new Blob([JSON.stringify(visible, null, 2)], { type: "application/json" });
    else if (kind === "csv") {
      const rows = ["seq,ms,level,text", ...visible.map(l => `${l.seq},${l.ms},${LV[l.lvl]},"${l.text.replace(/"/g,'""')}"`)];
      blob = new Blob([rows.join("\n")], { type: "text/csv" });
    } else {
      blob = new Blob([visible.map(l => `[${fmtTs(l)}] ${LV[l.lvl]} ${l.text}`).join("\n")], { type: "text/plain" });
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "serial-" + Date.now() + "." + kind; a.click();
  }

  function clearLog(){ lines = []; counts = { 0:0, 1:0, 2:0, 3:0 }; }

  function onWheel(){ /* user scrolled — pause autoscroll if scrolled away from bottom */
    if (!logEl) return;
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 20;
    if (!atBottom) autoscroll = false;
  }

  onMount(() => { open(); document.addEventListener("keydown", e => { if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); document.getElementById("search")?.focus(); } }); });
  onDestroy(() => ws?.close());
</script>

<div class="flex flex-col h-screen">
  <!-- ===== Header ===== -->
  <header class="flex items-center gap-3 px-5 h-16 border-b border-[color:var(--color-line)] backdrop-blur-xl
                 bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)]">
    <div class="w-8 h-8 grid place-items-center rounded-[10px] text-white"
         style="background:var(--grad);box-shadow:0 6px 20px -4px color-mix(in srgb,var(--color-brand) 60%,transparent),inset 0 1px 0 rgb(255 255 255/.25)">
      <Terminal size={14} strokeWidth={2.4}/>
    </div>
    <div class="flex flex-col min-w-0">
      <div class="flex items-center gap-2">
        <h1 class="font-semibold text-[15px] tracking-tight text-[color:var(--color-ink)]">JouleSerial Console</h1>
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px]
                     bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] border border-[color:var(--color-line)]"
              style:color={connected ? "var(--color-ok)" : "var(--color-muted)"}>
          <span class="w-[6px] h-[6px] rounded-full"
                style:background={connected ? "var(--color-ok)" : "var(--color-muted)"}
                style:box-shadow={connected ? "0 0 0 4px color-mix(in srgb,var(--color-ok) 18%,transparent)" : "none"}></span>
          {connected ? "Online" : "Offline"}
        </span>
      </div>
      <span class="text-[11.5px] text-[color:var(--color-muted)] font-mono">{clients} clients connected</span>
    </div>
    <div class="flex-1"></div>
    <button onclick={cycleTheme} aria-label="theme"
      class="w-8 h-8 grid place-items-center rounded-full text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,transparent)] transition cursor-pointer">◐</button>
  </header>

  <!-- ===== Toolbar ===== -->
  <div class="flex items-center gap-2 px-4 py-2 border-b border-[color:var(--color-line)] flex-wrap
              bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)]">
    <div class="relative flex items-center">
      <Search size={13} class="absolute left-2.5 text-[color:var(--color-muted)] pointer-events-none"/>
      <input id="search" bind:value={query} placeholder="filter — regex ok · press /"
        class="pl-7 pr-3 py-1.5 rounded-lg text-[12px] outline-none transition w-[220px] min-w-0
               bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] border border-[color:var(--color-line)]
               text-[color:var(--color-ink)] focus:border-[color:var(--color-brand)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-brand)_18%,transparent)]" />
    </div>
    <select bind:value={minLvl}
      class="px-2 py-1.5 rounded-lg text-[12px] outline-none cursor-pointer
             bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] border border-[color:var(--color-line)] text-[color:var(--color-ink)]">
      <option value={0}>DEBUG+</option><option value={1}>INFO+</option><option value={2}>WARN+</option><option value={3}>ERROR</option>
    </select>
    <button onclick={() => autoscroll = !autoscroll}
      class="px-2.5 py-1.5 rounded-lg text-[12px] border flex items-center gap-1.5 cursor-pointer transition
             border-[color:var(--color-line)] text-[color:var(--color-ink)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] hover:border-[color:var(--color-brand)]"
      class:!border-[color:var(--color-brand)]={autoscroll} class:!text-[color:var(--color-brand)]={autoscroll}>
      {#if autoscroll}<Play size={12}/> Auto{:else}<Pause size={12}/> Hold{/if}
    </button>
    <button onclick={() => tsMode = tsMode === "rel" ? "abs" : tsMode === "abs" ? "off" : "rel"}
      class="px-2.5 py-1.5 rounded-lg text-[12px] border cursor-pointer
             border-[color:var(--color-line)] text-[color:var(--color-ink)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] hover:border-[color:var(--color-brand)]">
      ⏱ {tsMode}
    </button>
    <button onclick={() => hex = !hex}
      class="px-2.5 py-1.5 rounded-lg text-[12px] border cursor-pointer
             border-[color:var(--color-line)] text-[color:var(--color-ink)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] hover:border-[color:var(--color-brand)]"
      class:!border-[color:var(--color-brand)]={hex} class:!text-[color:var(--color-brand)]={hex}>
      {hex ? "hex" : "text"}
    </button>
    <select bind:value={fsz}
      class="px-2 py-1.5 rounded-lg text-[12px] outline-none cursor-pointer
             bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] border border-[color:var(--color-line)] text-[color:var(--color-ink)]">
      <option value={12}>12px</option><option value={13}>13px</option><option value={14}>14px</option><option value={16}>16px</option>
    </select>
    <select onchange={(e) => { if (e.currentTarget.value) { exportLog(e.currentTarget.value); e.currentTarget.value = ''; } }}
      class="px-2 py-1.5 rounded-lg text-[12px] outline-none cursor-pointer
             bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] border border-[color:var(--color-line)] text-[color:var(--color-ink)]">
      <option value="">⤓ export</option><option value="txt">Text</option><option value="json">JSON</option><option value="csv">CSV</option>
    </select>
    <button onclick={clearLog}
      class="px-2.5 py-1.5 rounded-lg text-[12px] border flex items-center gap-1.5 cursor-pointer
             border-[color:var(--color-line)] text-[color:var(--color-ink)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] hover:border-[color:var(--color-err)] hover:text-[color:var(--color-err)]">
      <Eraser size={12}/> Clear
    </button>

    <div class="flex-1 min-w-[12px]"></div>

    <div class="hidden lg:flex gap-1.5 text-[10.5px] text-[color:var(--color-muted)]">
      {#each [["dbg",counts[0]],["inf",counts[1]],["wrn",counts[2]],["err",counts[3]],["rate",liveRate+"/s"],["total",visible.length]] as [k,v]}
        <span class="px-2 py-0.5 rounded-full border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] font-mono">
          {k} <b class="text-[color:var(--color-ink)]">{v}</b>
        </span>
      {/each}
    </div>
  </div>

  <!-- ===== Log pane ===== -->
  <div bind:this={logEl} onwheel={onWheel}
       class="flex-1 overflow-y-auto px-4 py-2 font-mono"
       style="font-size:var(--fs);background:color-mix(in srgb,var(--color-bg) 60%, #000 10%);line-height:1.5">
    {#each visible.slice(-2500) as l (l.seq)}
      <div class="grid items-center gap-2.5 px-2 py-[2px] rounded-md hover:bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)]"
           style:grid-template-columns={tsMode==="off" ? "52px 1fr" : "82px 52px 1fr"}>
        {#if tsMode !== "off"}<span class="text-[10.5px] text-[color:var(--color-muted)] tabular-nums">{fmtTs(l)}</span>{/if}
        <span class="px-1.5 py-0.5 rounded text-[9.5px] font-bold tracking-wider text-center"
              class:bg-[color-mix(in_srgb,var(--color-info)_30%,transparent)]={l.lvl===0}
              class:bg-[color-mix(in_srgb,var(--color-ok)_30%,transparent)]={l.lvl===1}
              class:bg-[color-mix(in_srgb,var(--color-warn)_55%,transparent)]={l.lvl===2}
              class:bg-[color-mix(in_srgb,var(--color-err)_40%,transparent)]={l.lvl===3}
              class:text-white={l.lvl!==2}
              class:text-black={l.lvl===2}>{LV[l.lvl]}</span>
        <span class="text-[color:var(--color-ink)] break-words whitespace-pre-wrap">{fmtTxt(l.text)}</span>
      </div>
    {/each}
  </div>

  <!-- ===== Command bar ===== -->
  <div class="flex items-center gap-2 px-4 py-3 border-t border-[color:var(--color-line)] backdrop-blur-xl
              bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)]">
    <input bind:value={cmd} onkeydown={onKey} autocomplete="off" autofocus
      placeholder="type a command — Enter to send · ↑/↓ history · / to focus filter"
      class="flex-1 px-3.5 py-2.5 rounded-xl font-mono text-[13px] outline-none transition
             bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] border border-[color:var(--color-line)]
             text-[color:var(--color-ink)] focus:border-[color:var(--color-brand)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-brand)_18%,transparent)]"/>
    <button onclick={send} aria-label="send"
      class="px-4 py-2.5 rounded-xl text-white font-semibold flex items-center gap-1.5 cursor-pointer transition-all hover:-translate-y-0.5"
      style="background:var(--grad);box-shadow:0 8px 24px -8px color-mix(in srgb,var(--color-brand) 70%,transparent)">
      <Send size={14} strokeWidth={2.4}/> Send
    </button>
  </div>
</div>
