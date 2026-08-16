<!-- ---------------------------------------------------------------------------
  VectiOTA — firmware updater SPA. Svelte 5 + Tailwind v4.
  (c) 2026 VectiVolt — Apache-2.0 License
--------------------------------------------------------------------------- -->
<script>
  import { onMount } from "svelte";
  import Card from "$shared/components/Card.svelte";
  import { store, fmtBytes, uid } from "$shared/lib/net.js";
  import Icon from "$shared/components/Icon.svelte";

  const ALL_MODES = [
    { key: "firmware",   label: "Firmware",   hint: "application image (.bin)",        flag: "allowFw"   },
    { key: "filesystem", label: "Filesystem", hint: "SPIFFS / LittleFS image",         flag: "allowFs"   },
    { key: "pull",       label: "Pull URL",   hint: "device fetches the image itself",  flag: "allowPull" },
  ];

  let info    = $state({});
  let mode    = $state("firmware");
  let dragging= $state(false);
  let busy    = $state(false);
  let pct     = $state(0);
  let bytes   = $state("");
  let speed   = $state("");
  let lines   = $state([]);
  let pullUrl = $state("");
  let theme   = $state(store.get("vecti-theme", "auto"));
  let xhr     = null;

  $effect(() => document.documentElement.setAttribute("data-theme", theme));
  function cycleTheme() {
    theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    store.set("vecti-theme", theme);
  }

  function log(text, kind = "info") {
    // Bounded: an OTA that retries in a loop used to grow this array without
    // limit until the tab ran out of memory.
    lines = [...lines, { id: uid(), text, kind }].slice(-200);
  }

  async function refreshInfo() {
    try {
      const r = await fetch("/ota/info", { cache: "no-store" });
      if (!r.ok) return;
      info = await r.json();
      if (info.title) document.title = info.title;
      if (info.brand) {
        document.documentElement.style.setProperty("--color-brand", info.brand);
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", info.brand);
      }
    } catch { /* device rebooting — the poll will pick it back up */ }
  }

  function upload(file) {
    if (busy || !file) return;
    if (mode === "pull") { log("Switch to Firmware or Filesystem to upload a file", "err"); return; }
    busy = true; pct = 0; lines = []; bytes = ""; speed = "";
    log(`${file.name} · ${fmtBytes(file.size)} · as ${mode}`);

    const fd = new FormData();
    fd.append("update", file, file.name);
    xhr = new XMLHttpRequest();
    const t0 = Date.now();

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      pct = (e.loaded * 100) / e.total;
      bytes = `${fmtBytes(e.loaded)} / ${fmtBytes(e.total)}`;
      const dt = (Date.now() - t0) / 1000;
      if (dt > 0.4) speed = `${fmtBytes(e.loaded / dt)}/s`;
    };
    // `function` rather than an arrow so `this` is the XHR: the module-level
    // `xhr` is nulled before these read it, and reading status off a stale
    // closure variable was how the old code reported "HTTP undefined".
    xhr.onload = function () {
      busy = false;
      const ok = this.status === 200;
      pct = ok ? 100 : pct;
      log(ok ? "Flash complete — device rebooting" : `HTTP ${this.status}: ${this.responseText || "rejected"}`,
          ok ? "ok" : "err");
      xhr = null;
      if (ok) setTimeout(() => location.reload(), 6000);
    };
    xhr.onerror  = () => { busy = false; xhr = null; log("Network error — upload aborted", "err"); };
    xhr.onabort  = () => { busy = false; xhr = null; pct = 0; log("Upload cancelled", "warn"); };
    xhr.open("POST", `/ota/upload?mode=${encodeURIComponent(mode)}`);
    xhr.send(fd);
  }

  function cancelUpload() { xhr?.abort(); }

  function onDrop(e) {
    e.preventDefault(); dragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) upload(f);
  }

  async function pullFromUrl() {
    if (!pullUrl) return;
    try {
      const r = await fetch("/ota/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pullUrl, mode: "firmware" }),
      });
      log(r.ok ? "Pull queued — device is fetching the image" : `Pull rejected (HTTP ${r.status})`,
          r.ok ? "ok" : "err");
    } catch { log("Could not reach the device", "err"); }
  }

  async function post(path, okMsg) {
    try {
      const r = await fetch(path, { method: "POST" });
      log(r.ok ? okMsg : `Failed (HTTP ${r.status})`, r.ok ? "ok" : "err");
      refreshInfo();
      return r.ok;
    } catch { log("Could not reach the device", "err"); return false; }
  }

  const commit = () => post("/ota/commit", "Current slot marked valid");
  function rollback() {
    if (!confirm("Roll back to the previous firmware slot and reboot?")) return;
    post("/ota/rollback", "Rolling back — device rebooting");
  }

  // Only offer the modes the firmware actually accepts. /ota/info reports
  // allowFw / allowFs / allowPull; the old UI ignored them and happily uploaded
  // into a disabled mode, where the device discarded the bytes and the page
  // still reported success. Before the first /ota/info lands, `info` is empty
  // and every flag reads undefined — show all three rather than an empty strip,
  // since the real check is server-side either way.
  let MODES = $derived(
    ALL_MODES.filter(m => info[m.flag] !== false)
  );
  $effect(() => {
    if (MODES.length && !MODES.some(m => m.key === mode)) mode = MODES[0].key;
  });

  // Progress ring geometry.
  const R = 42, CIRC = 2 * Math.PI * R;
  let dash = $derived(`${(pct / 100) * CIRC} ${CIRC}`);

  let slotTone = $derived(
    info.slotState === "valid" ? "ok" : info.slotState === "pending" ? "warn"
    : info.slotState === "invalid" ? "err" : "muted"
  );

  onMount(() => {
    refreshInfo();
    const poll = setInterval(refreshInfo, 5000);
    let es = null;
    try {
      es = new EventSource("/ota/events");
      es.addEventListener("progress", (e) => {
        try {
          const j = JSON.parse(e.data);
          // Only follow the server when this tab isn't the uploader — otherwise
          // the two sources fight and the bar stutters backwards.
          if (!busy && j.total) pct = (j.written * 100) / j.total;
        } catch { /* ignore malformed frame */ }
      });
      es.addEventListener("status", (e) => log(String(e.data)));
    } catch { /* SSE unavailable — polling still works */ }
    return () => { clearInterval(poll); es?.close(); xhr?.abort(); };
  });

  const DEVICE_ROWS = $derived([
    ["Hardware ID",  info.hwId       || "—"],
    ["Firmware",     info.fwVersion  || "—"],
    ["Running slot", info.currentSlot|| "—"],
    ["Target slot",  info.nextSlot   || "—"],
    ["Slot space",   fmtBytes(info.freeOta)],
    ["Free heap",    fmtBytes(info.freeHeap)],
  ]);
</script>

<a href="#main" class="skip">Skip to content</a>

<header class="hdr">
  <div class="wrap hdr-in">
    <span class="mark" aria-hidden="true"><Icon name="Upload" size={15} strokeWidth={2.4}/></span>
    <div class="ident">
      <h1>{info.title || "VectiOTA"}</h1>
      <p>{info.hwId ? `Device ${info.hwId}` : "Firmware updater"}</p>
    </div>
    <span class="pill" data-tone={info.updating ? "warn" : "ok"} aria-live="polite">
      <i aria-hidden="true"></i>{info.updating ? "Updating" : "Ready"}
    </span>
    <button class="icon-btn" onclick={cycleTheme}
            aria-label="Theme: {theme}. Click to change." title="Theme: {theme}">
      {#if theme === "light"}<Icon name="Sun" size={16}/>{:else if theme === "dark"}<Icon name="Moon" size={16}/>{:else}<Icon name="Monitor" size={16}/>{/if}
    </button>
  </div>
</header>

<main id="main" class="wrap grid">
  <Card span={12} label="Device">
    <dl class="rows">
      {#each DEVICE_ROWS as [k, v] (k)}
        <div class="row"><dt>{k}</dt><dd class="tnum">{v}</dd></div>
      {/each}
      <div class="row">
        <dt>Slot state</dt>
        <dd><span class="pill" data-tone={slotTone}><i aria-hidden="true"></i>{info.slotState || "unknown"}</span></dd>
      </div>
    </dl>
  </Card>

  <Card span={12} label="Update">
    <div class="tabs" role="tablist" aria-label="Update method">
      {#each MODES as m (m.key)}
        <button role="tab" id="tab-{m.key}" aria-controls="panel-{m.key}"
                aria-selected={mode === m.key} tabindex={mode === m.key ? 0 : -1}
                class="tab" class:on={mode === m.key}
                disabled={busy}
                onclick={() => (mode = m.key)}
                onkeydown={(e) => {
                  const i = MODES.findIndex(x => x.key === mode);
                  if (e.key === "ArrowRight") mode = MODES[(i + 1) % MODES.length].key;
                  else if (e.key === "ArrowLeft") mode = MODES[(i - 1 + MODES.length) % MODES.length].key;
                }}>
          {m.label}
        </button>
      {/each}
    </div>
    <p class="hint">{MODES.find(m => m.key === mode)?.hint}</p>

    {#if mode !== "pull"}
      <div id="panel-{mode}" role="tabpanel" aria-labelledby="tab-{mode}">
        <label class="drop" class:hot={dragging} class:off={busy}
               ondragenter={(e) => { e.preventDefault(); if (!busy) dragging = true; }}
               ondragover={(e) => { e.preventDefault(); }}
               ondragleave={() => (dragging = false)}
               ondrop={onDrop}>
          <span class="drop-ico" aria-hidden="true"><Icon name="Upload" size={24} strokeWidth={1.9}/></span>
          <span class="drop-t">Drop a <code>.bin</code> here</span>
          <span class="drop-s">or click to choose a file</span>
          <!-- Visually hidden, NOT display:none. A display:none input is removed
               from the tab order, which made firmware upload impossible without
               a mouse — the label is not focusable on its own. -->
          <input type="file" accept=".bin,.gz" disabled={busy}
                 aria-label="Firmware file"
                 onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }}/>
        </label>

        {#if busy || pct > 0}
          <div class="prog">
            <svg viewBox="0 0 100 100" width="88" height="88" aria-hidden="true">
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-line)" stroke-width="7"/>
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-brand)" stroke-width="7"
                      stroke-linecap="round" stroke-dasharray={dash} transform="rotate(-90 50 50)"
                      style="transition:stroke-dasharray .25s linear"/>
            </svg>
            <div class="prog-t" role="status" aria-live="polite">
              <strong class="tnum">{pct.toFixed(1)}%</strong>
              {#if bytes}<span class="tnum">{bytes}</span>{/if}
              {#if speed}<span class="tnum">{speed}</span>{/if}
            </div>
            {#if busy}
              <button class="btn ghost" onclick={cancelUpload}><Icon name="X" size={15}/> Cancel</button>
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <div id="panel-pull" role="tabpanel" aria-labelledby="tab-pull">
        <label class="fld">
          <span>Image URL</span>
          <input type="url" bind:value={pullUrl} placeholder="https://build.example.com/fw-1.4.2.bin"/>
        </label>
        <div class="btn-row">
          <button class="btn primary" onclick={pullFromUrl} disabled={!pullUrl}>
            <Icon name="Cloud" size={15}/> Pull &amp; flash
          </button>
          <button class="btn ghost" onclick={() => (pullUrl = "")}>Clear</button>
        </div>
      </div>
    {/if}

    {#if lines.length}
      <ul class="log" role="log" aria-live="polite" aria-label="Update log">
        {#each lines as l (l.id)}<li data-k={l.kind}>{l.text}</li>{/each}
      </ul>
    {/if}
  </Card>

  <Card span={12} label="Slot maintenance">
    <p class="hint">
      Commit marks the running firmware known-good and cancels the rollback
      watchdog. Rollback reboots into the previous slot.
    </p>
    <div class="btn-row">
      <button class="btn ghost" onclick={commit}><Icon name="ShieldCheck" size={15}/> Commit current</button>
      <button class="btn danger" onclick={rollback}><Icon name="RefreshCw" size={15}/> Roll back</button>
    </div>
  </Card>
</main>

<style>
.skip { position:absolute; left:-9999px; top:0; z-index:100; padding:10px 14px;
        background:var(--color-panel); color:var(--color-ink); border-radius:var(--radius-ctl); }
.skip:focus { left:12px; top:12px; }

.wrap { max-width: 720px; margin: 0 auto; padding: 0 16px; }

.hdr { position: sticky; top: 0; z-index: 20; background: var(--color-bg);
       border-bottom: 1px solid var(--color-line); }
.hdr-in { display: flex; align-items: center; gap: 12px; height: 60px; }
.mark { display: grid; place-items: center; width: 30px; height: 30px; flex: none;
        border-radius: 9px; color: #fff; background: var(--grad); }
.ident { min-width: 0; flex: 1; }
.ident h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.01em;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ident p  { margin: 0; font-size: 12px; color: var(--color-muted);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pill { display: inline-flex; align-items: center; gap: 6px; flex: none;
        padding: 3px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600;
        border: 1px solid var(--color-line); color: var(--color-muted); }
.pill i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.pill[data-tone="ok"]   { color: var(--color-ok); }
.pill[data-tone="warn"] { color: var(--color-warn); }
.pill[data-tone="err"]  { color: var(--color-err); }

.icon-btn { display: grid; place-items: center; width: 32px; height: 32px; flex: none;
            border: 0; background: none; color: var(--color-muted); cursor: pointer;
            border-radius: 8px; }
.icon-btn:hover { color: var(--color-ink); background: var(--color-bg-soft); }

.grid { display: grid; grid-template-columns: repeat(12, minmax(0,1fr));
        gap: 12px; padding-top: 16px; padding-bottom: 40px; }

.rows { display: grid; gap: 6px; margin: 0;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
       padding: 8px 10px; border-radius: var(--radius-ctl); background: var(--color-panel-2);
       border: 1px solid var(--color-line-soft); min-width: 0; }
.row dt { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
          font-weight: 600; color: var(--color-muted); flex: none; }
.row dd { margin: 0; font-family: var(--font-mono); font-size: 12.5px; font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tabs { display: flex; gap: 4px; padding: 3px; border-radius: var(--radius-ctl);
        background: var(--color-bg-soft); border: 1px solid var(--color-line-soft); }
.tab { flex: 1; padding: 7px 10px; border: 0; border-radius: 7px; cursor: pointer;
       font: inherit; font-size: 13px; font-weight: 600; color: var(--color-muted);
       background: none; }
.tab.on { background: var(--color-panel); color: var(--color-ink); box-shadow: var(--shadow-card); }
.tab:disabled { opacity: .5; cursor: not-allowed; }

.hint { margin: 0; font-size: 12.5px; color: var(--color-muted); }

.drop { display: grid; place-items: center; gap: 4px; padding: 28px 16px; cursor: pointer;
        border: 1.5px dashed var(--color-line); border-radius: var(--radius-card);
        text-align: center; transition: border-color .15s, background .15s; }
.drop:hover, .drop.hot { border-color: var(--color-brand);
        background: color-mix(in srgb, var(--color-brand) 6%, transparent); }
.drop.off { opacity: .5; pointer-events: none; }
/* Off-screen but focusable, so Tab still reaches the file picker. */
.drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.drop:focus-within { border-color: var(--color-brand);
                     outline: 2px solid var(--color-brand); outline-offset: 2px; }
.drop-ico { color: var(--color-brand); }
.drop-t { font-size: 14.5px; font-weight: 600; }
.drop-t code { font-family: var(--font-mono); font-size: .92em; color: var(--color-brand); }
.drop-s { font-size: 12px; color: var(--color-muted); }

.prog { display: flex; align-items: center; gap: 16px; margin-top: 14px; flex-wrap: wrap; }
.prog-t { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 120px; }
.prog-t strong { font-size: 25px; font-weight: 600; font-family: var(--font-mono);
                 color: var(--color-brand); line-height: 1.1; }
.prog-t span { font-size: 12px; color: var(--color-muted); font-family: var(--font-mono); }

.fld { display: grid; gap: 5px; }
.fld span { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
            font-weight: 600; color: var(--color-muted); }
.fld input { width: 100%; padding: 9px 11px; font: inherit; font-size: 13.5px;
             font-family: var(--font-mono);
             color: var(--color-ink); background: var(--color-panel-2);
             border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
.fld input:focus { outline: 2px solid var(--color-brand); outline-offset: 1px; border-color: transparent; }

.btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
       flex: 1; min-width: 130px; padding: 9px 14px; cursor: pointer;
       font: inherit; font-size: 13.5px; font-weight: 600;
       border-radius: var(--radius-ctl); border: 1px solid var(--color-line);
       background: var(--color-panel); color: var(--color-ink); }
.btn:hover:not(:disabled) { border-color: var(--color-brand); color: var(--color-brand); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn.primary { background: var(--color-brand); border-color: var(--color-brand); color: #fff; }
.btn.primary:hover:not(:disabled) { filter: brightness(1.07); color: #fff; }
.btn.danger:hover:not(:disabled) { border-color: var(--color-err); color: var(--color-err); }
.btn.ghost { flex: 0 1 auto; }

.log { list-style: none; margin: 12px 0 0; padding: 10px 12px; max-height: 160px; overflow: auto;
       background: var(--color-bg-soft); border: 1px solid var(--color-line-soft);
       border-radius: var(--radius-ctl); font-family: var(--font-mono); font-size: 11.5px;
       line-height: 1.65; color: var(--color-ink-2); }
.log li[data-k="ok"]   { color: var(--color-ok); }
.log li[data-k="warn"] { color: var(--color-warn); }
.log li[data-k="err"]  { color: var(--color-err); }
</style>
