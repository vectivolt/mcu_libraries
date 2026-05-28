<!-- ---------------------------------------------------------------------------
  JouleNet — Wi-Fi provisioning portal SPA. Svelte 5 + Tailwind v4.
  Glass-card layout, animated signal-bar SVG, scanning shimmer, custom-param form.
  Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT
--------------------------------------------------------------------------- -->
<script>
  import { onMount, onDestroy } from "svelte";
  import Card from "$shared/components/Card.svelte";
  import { Wifi, Settings, Activity, Lock, RotateCcw, Trash2, RefreshCw, Power } from "lucide-svelte";

  let tab = $state("wifi");
  let networks = $state([]);
  let scanning = $state(true);
  let selected = $state(null);
  let pwd = $state("");
  let hiddenSsid = $state("");
  let advOpen = $state(false);
  let host = $state(""), cc = $state(""), sip = $state(""), sgw = $state(""), smask = $state("");
  let connecting = $state(false);
  let params = $state([]);
  let paramValues = $state({});
  let status = $state(null);
  let toasts = $state([]);
  let theme = $state(localStorage.getItem("joule-theme") || "dark");
  let title = $state("JouleNet");
  let statusTimer;

  $effect(() => document.documentElement.setAttribute("data-theme", theme));
  function cycleTheme(){ theme = theme==="dark" ? "light" : theme==="light" ? "auto" : "dark"; localStorage.setItem("joule-theme", theme); }

  function toast(msg, kind = "info") {
    const t = { id: crypto.randomUUID(), msg, kind };
    toasts = [...toasts, t]; setTimeout(() => toasts = toasts.filter(x => x.id !== t.id), 2400);
  }

  async function scan() {
    scanning = true;
    try {
      const r = await fetch("/wifi/scan"); const j = await r.json();
      networks = j.networks || []; if (!networks.length) await new Promise(r => setTimeout(r, 500));
    } catch { toast("scan failed", "err"); }
    finally { scanning = false; }
  }

  async function loadStatus() {
    try { const r = await fetch("/wifi/status"); const j = await r.json();
      if (j.title) { title = j.title; document.title = j.title; }
      if (j.brand) { document.documentElement.style.setProperty("--color-brand", j.brand);
                     document.querySelector('meta[name="theme-color"]')?.setAttribute("content", j.brand); }
      status = j;
    } catch {}
  }

  async function loadParams() {
    try { const r = await fetch("/wifi/params"); const j = await r.json();
      params = j.params || [];
      const v = {}; for (const p of params) v[p.key] = p.value;
      paramValues = v;
    } catch {}
  }

  async function saveParams() {
    const r = await fetch("/wifi/params", { method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify(paramValues) });
    toast(r.ok ? "saved" : "save failed", r.ok ? "ok" : "err");
  }

  async function connect() {
    const ssid = selected?.ssid || hiddenSsid.trim();
    if (!ssid) { toast("pick a network", "err"); return; }
    connecting = true;
    const body = { ssid, password: pwd, hidden: !selected && !!hiddenSsid, hostname: host, countryCode: cc, staticIp: sip, gateway: sgw, netmask: smask };
    const r = await fetch("/wifi/connect", { method:"POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(body) });
    toast(r.ok ? "connecting — check Status" : "rejected", r.ok ? "ok" : "err");
    connecting = false;
  }

  async function restart(){ await fetch("/wifi/restart", { method:"POST" }); toast("restarting", "ok"); }
  async function erase(){ if (!confirm("Erase ALL Wi-Fi credentials + settings, then reboot?")) return;
    await fetch("/wifi/reset", { method:"POST" }); toast("erased — rebooting", "ok"); }

  onMount(() => { scan(); loadStatus(); statusTimer = setInterval(() => { if (tab === "status") loadStatus(); }, 3000); });
  onDestroy(() => clearInterval(statusTimer));

  function bars(rssi){ return Math.max(0, Math.min(4, Math.round((rssi + 90) / 10))); }
  const stateLabel = ["idle","connecting","connected","portal","failed"];
</script>

<header class="sticky top-0 z-50 backdrop-blur-xl border-b border-[color:var(--color-line)]"
        style="background:color-mix(in srgb,var(--color-bg) 80%,transparent)">
  <div class="max-w-[600px] mx-auto px-6 h-16 flex items-center gap-3">
    <div class="w-8 h-8 grid place-items-center rounded-[10px] text-white"
         style="background:var(--grad);box-shadow:0 6px 20px -4px color-mix(in srgb,var(--color-brand) 60%,transparent),inset 0 1px 0 rgb(255 255 255/.25)">
      <Wifi size={16} strokeWidth={2.4}/>
    </div>
    <div class="flex flex-col min-w-0">
      <div class="flex items-center gap-2">
        <h1 class="font-semibold text-[15px] tracking-tight text-[color:var(--color-ink)] truncate">{title}</h1>
        {#if status?.state === 2}
          <span class="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px]
                       bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] border border-[color:var(--color-line)]"
                style="color:var(--color-ok)">
            <span class="w-[6px] h-[6px] rounded-full" style="background:var(--color-ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--color-ok) 18%,transparent)"></span>
            Connected
          </span>
        {/if}
      </div>
      <span class="text-[11.5px] text-[color:var(--color-muted)] font-medium">pick a network · apply settings</span>
    </div>
    <div class="flex-1"></div>
    <button onclick={cycleTheme} aria-label="theme"
      class="w-8 h-8 grid place-items-center rounded-full text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,transparent)] transition cursor-pointer">◐</button>
  </div>
</header>

<main class="max-w-[600px] mx-auto px-5 py-5">
  <!-- Tab segmented control -->
  <div class="flex gap-1 p-1 mb-4 rounded-[14px] border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)]">
    {#each [["wifi","📶 Wi-Fi"],["params","⚙ Setup"],["status","📊 Status"]] as [k,t]}
      <button onclick={() => { tab = k; if (k === "params") loadParams(); if (k === "status") loadStatus(); }}
        class="flex-1 px-3 py-2 rounded-[10px] text-[13px] font-semibold transition-all cursor-pointer"
        class:text-white={tab === k}
        class:text-[color:var(--color-muted)]={tab !== k}
        style:background={tab === k ? "var(--grad)" : "transparent"}
        style:box-shadow={tab === k ? "0 4px 12px -2px color-mix(in srgb, var(--color-brand) 50%, transparent)" : "none"}>
        {t}
      </button>
    {/each}
  </div>

  {#if tab === "wifi"}
    <Card span={12}>
      <div class="flex items-center justify-between -mt-1 mb-2">
        <span class="text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)]">Available networks</span>
        <button onclick={scan} disabled={scanning}
          class="px-2.5 py-1 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 border border-[color:var(--color-line)] cursor-pointer disabled:opacity-50
                 hover:border-[color:var(--color-brand)] hover:text-[color:var(--color-brand)] transition"
          style="color:var(--color-ink)">
          <RotateCcw size={12} class={scanning ? "animate-spin" : ""}/> Rescan
        </button>
      </div>

      <!-- network list -->
      {#if scanning && networks.length === 0}
        {#each [0,1,2,3] as i}
          <div class="h-12 my-1 rounded-xl shimmer"></div>
        {/each}
      {:else if networks.length === 0}
        <div class="py-6 text-center text-[13px] text-[color:var(--color-muted)]">no networks found — try again</div>
      {:else}
        {#each networks as n}
          {@const b = bars(n.rssi)}
          <button onclick={() => { selected = n; }}
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all my-0.5 cursor-pointer text-left"
            class:border-[color:var(--color-brand)]={selected?.ssid === n.ssid}
            class:border-transparent={selected?.ssid !== n.ssid}
            style:background={selected?.ssid === n.ssid ? "color-mix(in srgb, var(--color-brand) 12%, transparent)" : "transparent"}>
            <!-- 4-bar SVG signal -->
            <svg viewBox="0 0 20 16" class="w-5 h-4 flex-shrink-0">
              {#each [0,1,2,3] as i}
                <rect x={i*5} y={12-(i+1)*3} width="3" height={(i+1)*3} rx="1"
                      fill={i < b ? "var(--color-brand)" : "color-mix(in srgb, var(--color-ink) 12%, transparent)"} />
              {/each}
            </svg>
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-[14px] text-[color:var(--color-ink)] truncate">{n.ssid || "(hidden)"}</div>
              <div class="text-[10.5px] text-[color:var(--color-muted)] font-mono truncate">ch {n.ch} · {n.rssi} dBm · {n.bssid}</div>
            </div>
            {#if n.sec}<Lock size={12} class="text-[color:var(--color-muted)]"/>{/if}
          </button>
        {/each}
      {/if}

      <!-- password + advanced -->
      <label class="block mt-3">
        <span class="block text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-1">Password</span>
        <input type="password" bind:value={pwd} placeholder="leave empty for open networks"
          class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] outline-none transition
                 bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)]
                 focus:border-[color:var(--color-brand)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_22%,transparent)]"/>
      </label>
      <label class="block mt-2">
        <span class="block text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-1">Or join hidden SSID</span>
        <input bind:value={hiddenSsid}
          class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] outline-none transition
                 bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] focus:border-[color:var(--color-brand)]"/>
      </label>

      <button onclick={() => advOpen = !advOpen} class="text-[12px] text-[color:var(--color-brand)] font-semibold mt-2 cursor-pointer self-start">
        {advOpen ? "▾" : "▸"} Advanced (static IP · hostname · country)
      </button>
      {#if advOpen}
        <label class="block mt-1"><span class="block text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-1">Hostname (mDNS)</span>
          <input bind:value={host} placeholder="joule" class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none transition focus:border-[color:var(--color-brand)]"/>
        </label>
        <div class="grid grid-cols-2 gap-2 mt-1">
          <label><span class="block text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-1">Country</span>
            <input bind:value={cc} placeholder="IN" maxlength="2" class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"/></label>
          <label><span class="block text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-1">Static IP</span>
            <input bind:value={sip} placeholder="(DHCP)" class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"/></label>
        </div>
        <div class="grid grid-cols-2 gap-2 mt-1">
          <label><span class="block text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-1">Gateway</span>
            <input bind:value={sgw} class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"/></label>
          <label><span class="block text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-1">Netmask</span>
            <input bind:value={smask} placeholder="255.255.255.0" class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"/></label>
        </div>
      {/if}

      <button onclick={connect} disabled={connecting}
        class="mt-4 w-full px-4 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5 disabled:opacity-60"
        style="background:var(--grad);box-shadow:0 8px 24px -8px color-mix(in srgb,var(--color-brand) 70%,transparent)">
        {#if connecting}<RotateCcw size={14} class="animate-spin"/>{:else}<Power size={14}/>{/if}
        {connecting ? "Connecting…" : "Connect"}
      </button>
    </Card>

  {:else if tab === "params"}
    <Card span={12}>
      {#if !params.length}
        <div class="py-6 text-center text-[13px] text-[color:var(--color-muted)]">no custom parameters defined</div>
      {:else}
        {#each params as p}
          {#if p.type === "header"}
            <div class="font-bold text-[11px] uppercase tracking-wider mt-3 mb-1" style="color:var(--color-brand)">{p.label}</div>
          {:else if p.type === "divider"}
            <hr class="my-3 border-t border-[color:var(--color-line)]"/>
          {:else}
            <label class="block mb-2.5">
              <span class="block text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)] mb-1">{p.label}</span>
              {#if p.type === "password"}
                <input type="password" bind:value={paramValues[p.key]} placeholder={p.hint}
                  class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"/>
              {:else if p.type === "number"}
                <input type="number" bind:value={paramValues[p.key]} min={p.min} max={p.max}
                  class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"/>
              {:else if p.type === "dropdown"}
                <select bind:value={paramValues[p.key]}
                  class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none cursor-pointer">
                  {#each (p.opts || "").split("|") as o}<option value={o}>{o}</option>{/each}
                </select>
              {:else if p.type === "toggle"}
                <button onclick={() => paramValues[p.key] = paramValues[p.key] === "1" ? "0" : "1"} aria-label="{p.label} toggle"
                  class="relative w-12 h-7 rounded-full transition cursor-pointer"
                  style:background={paramValues[p.key] === "1" ? "var(--grad)" : "color-mix(in srgb, var(--color-ink) 12%, transparent)"}>
                  <span class="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-md transition" style:left={paramValues[p.key] === "1" ? "23px" : "3px"}></span>
                </button>
              {:else if p.type === "color"}
                <input type="color" bind:value={paramValues[p.key]} class="w-14 h-10 rounded-lg border-0 cursor-pointer overflow-hidden"/>
              {:else if p.type === "textarea"}
                <textarea bind:value={paramValues[p.key]} placeholder={p.hint} rows="4"
                  class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none font-mono text-[12.5px] focus:border-[color:var(--color-brand)] resize-y"></textarea>
              {:else}
                <input bind:value={paramValues[p.key]} placeholder={p.hint}
                  class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"/>
              {/if}
            </label>
          {/if}
        {/each}
        <button onclick={saveParams}
          class="mt-3 w-full px-4 py-3 rounded-xl text-white font-semibold cursor-pointer transition-all hover:-translate-y-0.5"
          style="background:var(--grad);box-shadow:0 8px 24px -8px color-mix(in srgb,var(--color-brand) 70%,transparent)">
          💾 Save settings
        </button>
      {/if}
    </Card>

  {:else if tab === "status"}
    <Card span={12}>
      {#if !status}
        <div class="py-6 text-center text-[13px] text-[color:var(--color-muted)]">loading…</div>
      {:else}
        {#each [
          ["State",   stateLabel[status.state] || status.state],
          ["SSID",    status.ssid],
          ["IP",      status.ip],
          ["Gateway", status.gateway],
          ["Netmask", status.mask],
          ["DNS",     status.dns],
          ["BSSID",   status.bssid],
          ["Channel", status.channel],
          ["RSSI",    status.rssi + " dBm"],
          ["Hostname",status.hostname],
          ["mDNS",    status.mdns],
          ["MAC",     status.mac],
          ["Heap",    Math.round(status.heap / 1024) + " KB"],
          ["Uptime",  status.uptime_s + " s"],
        ] as [k,v]}
          <div class="flex justify-between items-center py-2 border-b border-dashed border-[color:var(--color-line)] last:border-0">
            <span class="text-[10.5px] uppercase tracking-wider font-semibold text-[color:var(--color-muted)]">{k}</span>
            <span class="font-mono text-[13px] font-semibold text-[color:var(--color-ink)]">{v}</span>
          </div>
        {/each}
        <div class="flex gap-2 mt-4">
          <button onclick={restart}
            class="flex-1 px-4 py-2.5 rounded-xl font-semibold border border-[color:var(--color-line)] text-[color:var(--color-ink)] flex items-center justify-center gap-2 cursor-pointer
                   bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] hover:border-[color:var(--color-brand)] transition">
            <RefreshCw size={14}/> Restart
          </button>
          <button onclick={erase}
            class="flex-1 px-4 py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-all hover:-translate-y-0.5"
            style="background:linear-gradient(135deg,var(--color-err),#f87171);box-shadow:0 8px 24px -8px color-mix(in srgb,var(--color-err) 70%,transparent)">
            <Trash2 size={14}/> Erase &amp; reboot
          </button>
        </div>
      {/if}
    </Card>
  {/if}
</main>

<div class="fixed left-1/2 -translate-x-1/2 bottom-6 flex flex-col gap-2 z-50 pointer-events-none">
  {#each toasts as t (t.id)}
    <div class="px-4 py-2.5 rounded-xl font-semibold text-[13px] pointer-events-auto border bg-[color:var(--color-panel-solid)]"
         style:box-shadow="var(--shadow-card)"
         style:border-color={t.kind === "ok" ? "var(--color-ok)" : t.kind === "err" ? "var(--color-err)" : "var(--color-line)"}>{t.msg}</div>
  {/each}
</div>

<style>
.shimmer {
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--color-ink) 4%, transparent) 0%,
    color-mix(in srgb, var(--color-ink) 8%, transparent) 50%,
    color-mix(in srgb, var(--color-ink) 4%, transparent) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
