<!-- ---------------------------------------------------------------------------
  JouleOTA — drag-drop firmware updater SPA. Svelte 5 + Tailwind v4.
  Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT
--------------------------------------------------------------------------- -->
<script>
  import { onMount } from "svelte";
  import Card from "$shared/components/Card.svelte";
  import { Upload, Cpu, RefreshCw, Cloud, FileDown } from "lucide-svelte";

  let info = $state({});
  let mode = $state("firmware");
  let dragging = $state(false);
  let busy = $state(false);
  let pct = $state(0);
  let speed = $state("");
  let logLines = $state([]);
  let pullUrl = $state("");
  let theme = $state(localStorage.getItem("joule-theme") || "dark");

  $effect(() => document.documentElement.setAttribute("data-theme", theme));
  function cycleTheme(){ theme = theme==="dark" ? "light" : theme==="light" ? "auto" : "dark"; localStorage.setItem("joule-theme",theme); }

  async function refreshInfo(){
    try {
      const r = await fetch("/ota/info"); const j = await r.json();
      info = j;
      if (j.title) document.title = j.title;
      if (j.brand) { document.documentElement.style.setProperty("--color-brand", j.brand);
                     document.querySelector('meta[name="theme-color"]')?.setAttribute("content", j.brand); }
    } catch {}
  }
  function log(line){ logLines = [...logLines, line]; }
  function fmtBytes(n){ if(!n) return "—"; if(n<1024) return n+" B"; if(n<1048576) return (n/1024).toFixed(1)+" KB"; return (n/1048576).toFixed(2)+" MB"; }

  function upload(file){
    if (busy) return;
    if (mode === "pull") { log("✗ switch to Firmware/Filesystem tab first"); return; }
    busy = true; pct = 0; logLines = [];
    log("→ " + file.name + "  " + fmtBytes(file.size) + "  as " + mode);
    const fd = new FormData(); fd.append("update", file);
    const xhr = new XMLHttpRequest();
    const t0 = Date.now();
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      pct = e.loaded * 100 / e.total;
      const dt = (Date.now() - t0) / 1000;
      if (dt > 0.4) speed = fmtBytes(e.loaded / dt) + "/s";
    };
    xhr.onload = () => {
      busy = false;
      if (xhr.status === 200) { pct = 100; log("✓ done — rebooting"); setTimeout(()=>location.reload(), 5000); }
      else                    { log("✗ HTTP " + xhr.status + "  " + xhr.responseText); }
    };
    xhr.onerror = () => { busy = false; log("✗ network error"); };
    xhr.open("POST", "/ota/upload?mode=" + mode);
    xhr.send(fd);
  }

  function onDrop(e){ e.preventDefault(); dragging=false; const f=e.dataTransfer.files[0]; if(f) upload(f); }
  async function pullFromUrl(){
    if (!pullUrl) return;
    const r = await fetch("/ota/pull", { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ url: pullUrl, mode: "firmware" })});
    log(r.ok ? "✓ pull queued" : "✗ pull rejected");
  }

  async function commit(){ const r = await fetch("/ota/commit", { method:"POST" }); log(r.ok ? "✓ committed" : "✗ commit failed"); refreshInfo(); }
  async function rollback(){ if(!confirm("Roll back to previous slot?")) return; const r = await fetch("/ota/rollback", { method:"POST" }); log(r.ok ? "↺ rolling back" : "✗ rollback failed"); }

  // Progress ring SVG path math (circumference = 2πr where r=44)
  let circ = 2 * Math.PI * 44;
  let ringDash = $derived(`${(pct/100) * circ} ${circ}`);

  // SSE — server pushes pull-mode progress events while we wait
  let es;
  onMount(() => {
    refreshInfo(); const t = setInterval(refreshInfo, 4000);
    try {
      es = new EventSource("/ota/events");
      es.addEventListener("progress", e => { const j = JSON.parse(e.data); if (j.total) pct = j.written*100/j.total; });
      es.addEventListener("status", e => log("• " + e.data));
    } catch {}
    return () => { clearInterval(t); es?.close(); };
  });
</script>

<header class="sticky top-0 z-10 flex items-center gap-3.5 px-6 py-4 border-b border-[color:var(--color-line)] backdrop-blur-xl
               bg-[color-mix(in_srgb,var(--color-bg)_75%,transparent)]">
  <div class="w-9 h-9 grid place-items-center rounded-[11px] text-white"
       style="background:var(--grad);box-shadow:0 8px 24px -4px color-mix(in srgb,var(--color-brand) 60%,transparent),inset 0 1px 0 rgb(255 255 255/.25)">
    <Upload size={18} strokeWidth={2.2}/>
  </div>
  <div class="flex-1">
    <div class="font-semibold text-[15.5px] tracking-tight text-[color:var(--color-ink)]">{info.title || "JouleOTA"}</div>
    <div class="text-[11.5px] text-[color:var(--color-muted)]">drag a firmware to flash</div>
  </div>
  <span class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-[color:var(--color-line)]
               bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink-2)]">
    <span class="w-[6px] h-[6px] rounded-full bg-[color:var(--color-ok)]" style="box-shadow:0 0 0 4px color-mix(in srgb,var(--color-ok) 18%,transparent)"></span>
    {info.updating ? "updating" : "live"}
  </span>
  <button onclick={cycleTheme} aria-label="theme"
    class="w-9 h-9 grid place-items-center rounded-[11px] border border-[color:var(--color-line)] text-[color:var(--color-ink)]
           bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] hover:text-[color:var(--color-brand)] hover:border-[color:var(--color-brand)] transition-all hover:-translate-y-px cursor-pointer">◐</button>
</header>

<main class="max-w-[780px] mx-auto px-5 py-6 grid gap-4" style="grid-template-columns:repeat(12,minmax(0,1fr))">

  <!-- Device card -->
  <Card span={12} label="Device">
    <div class="grid gap-2.5 mt-1" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
      {#each [
        ["Hardware ID", info.hwId || "—"],
        ["Firmware",    info.fwVersion || "—"],
        ["Current slot", info.currentSlot || "—"],
        ["Next slot",    info.nextSlot || "—"],
        ["Free for OTA", fmtBytes(info.freeOta)],
        ["Free heap",    fmtBytes(info.freeHeap)],
      ] as [k,v]}
        <div class="flex justify-between items-center px-3 py-2.5 rounded-xl text-[13px]
                    bg-[color-mix(in_srgb,var(--color-line)_60%,transparent)]">
          <span class="text-[color:var(--color-muted)] text-[11px] uppercase tracking-wider font-semibold">{k}</span>
          <span class="font-mono font-semibold text-[12.5px] text-[color:var(--color-ink)]">{v}</span>
        </div>
      {/each}
    </div>
  </Card>

  <!-- Upload card -->
  <Card span={12} label="Upload">
    <div class="flex gap-2 mb-2 -mt-1">
      {#each [["firmware","🔧 Firmware"],["filesystem","📁 Filesystem"],["pull","☁ Pull URL"]] as [k,t]}
        <button onclick={() => mode = k}
          class="flex-1 px-3.5 py-2 rounded-xl text-[13px] font-semibold border transition-all min-h-[40px] cursor-pointer"
          class:text-white={mode === k}
          class:text-[color:var(--color-muted)]={mode !== k}
          style:background={mode === k ? "var(--grad)" : "color-mix(in srgb, var(--color-ink) 4%, transparent)"}
          style:border-color={mode === k ? "transparent" : "var(--color-line)"}
          style:box-shadow={mode === k ? "0 8px 24px -8px color-mix(in srgb, var(--color-brand) 70%, transparent)" : "none"}>
          {t}
        </button>
      {/each}
    </div>

    {#if mode !== "pull"}
      <label
        ondragenter={(e) => { e.preventDefault(); dragging=true; }}
        ondragover={(e) => { e.preventDefault(); dragging=true; }}
        ondragleave={() => dragging=false}
        ondrop={onDrop}
        class="block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all"
        class:border-[color:var(--color-line)]={!dragging}
        class:border-[color:var(--color-brand)]={dragging}
        style:background={dragging ? "color-mix(in srgb, var(--color-brand) 8%, transparent)" : "transparent"}>
        <div class="mx-auto w-14 h-14 grid place-items-center rounded-2xl mb-3 text-[color:var(--color-brand)]"
             style="background:color-mix(in srgb, var(--color-brand) 12%, transparent)">
          <Upload size={28} strokeWidth={2}/>
        </div>
        <div class="text-[15px] font-semibold text-[color:var(--color-ink)]">Drop a <code class="font-mono text-[color:var(--color-brand)]">.bin</code> here</div>
        <div class="text-[12px] text-[color:var(--color-muted)] mt-1">or click to browse · accepts .bin and .bin.gz</div>
        <input type="file" accept=".bin,.gz" class="hidden" onchange={(e) => { const f = e.currentTarget.files[0]; if (f) upload(f); }}/>
      </label>

      {#if busy || pct > 0}
        <div class="flex items-center gap-5 mt-5">
          <svg viewBox="0 0 100 100" class="w-24 h-24 flex-shrink-0">
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-line)" stroke-width="8" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="url(#og)" stroke-width="8"
              stroke-linecap="round" stroke-dasharray={ringDash} transform="rotate(-90 50 50)" style="transition:stroke-dasharray .3s ease"/>
            <defs><linearGradient id="og" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stop-color="var(--color-brand)"/><stop offset="1" stop-color="var(--color-brand-2)"/>
            </linearGradient></defs>
          </svg>
          <div class="flex-1">
            <div class="text-[28px] font-bold font-mono tabular-nums" style="background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">{pct.toFixed(1)}%</div>
            {#if speed}<div class="text-[12px] text-[color:var(--color-muted)]">{speed}</div>{/if}
          </div>
        </div>
      {/if}

      {#if logLines.length}
        <pre class="mt-4 p-3 rounded-xl text-[11.5px] font-mono leading-relaxed overflow-auto max-h-32
                    bg-[color-mix(in_srgb,#000_30%,transparent)] text-[color:var(--color-ink-2)]
                    border border-[color:var(--color-line)]">{logLines.join("\n")}</pre>
      {/if}

    {:else}
      <input type="url" bind:value={pullUrl} placeholder="https://example.com/firmware.bin"
        class="w-full px-3.5 py-3 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)]
               text-[color:var(--color-ink)] font-mono text-[13px] outline-none transition-all
               focus:border-[color:var(--color-brand)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_22%,transparent)]"/>
      <div class="flex gap-2 mt-3">
        <button onclick={pullFromUrl}
          class="flex-1 px-4 py-2.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5"
          style="background:var(--grad);box-shadow:0 8px 24px -8px color-mix(in srgb,var(--color-brand) 70%,transparent)">
          <Cloud size={16} strokeWidth={2.2}/> Pull &amp; flash
        </button>
        <button onclick={() => pullUrl=''}
          class="flex-1 px-4 py-2.5 rounded-xl font-semibold border border-[color:var(--color-line)] text-[color:var(--color-ink)]
                 bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] cursor-pointer">Cancel</button>
      </div>
    {/if}
  </Card>

  <!-- Maintenance -->
  <Card span={12} label="Maintenance">
    <div class="text-[12.5px] text-[color:var(--color-muted)] mb-2">Commit marks the current firmware as known-good. Rollback returns to the previous slot.</div>
    <div class="flex gap-2 flex-wrap">
      <button onclick={commit}
        class="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl font-semibold border border-[color:var(--color-line)]
               text-[color:var(--color-ink)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] flex items-center justify-center gap-2 cursor-pointer
               hover:border-[color:var(--color-ok)] hover:text-[color:var(--color-ok)] transition-all">
        <Cpu size={16} strokeWidth={2.2}/> Commit current
      </button>
      <button onclick={rollback}
        class="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 cursor-pointer
               transition-all hover:-translate-y-0.5"
        style="background:linear-gradient(135deg,var(--color-err),#f87171);box-shadow:0 8px 24px -8px color-mix(in srgb,var(--color-err) 70%,transparent)">
        <RefreshCw size={16} strokeWidth={2.2}/> Rollback
      </button>
    </div>
  </Card>
</main>
