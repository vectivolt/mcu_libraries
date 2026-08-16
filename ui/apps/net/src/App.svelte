<!-- ---------------------------------------------------------------------------
  VectiNet — Wi-Fi provisioning portal SPA. Svelte 5 + Tailwind v4.

  Served from the device's flash over plain http:// at a link-local address,
  usually to a phone that is *joined to the device's own AP* — so every fetch
  here can die mid-flight when the radio flips to STA. Nothing in this file may
  assume a secure context, working localStorage, or a request that completes.

  (c) 2026 VectiVolt — Apache-2.0 License
--------------------------------------------------------------------------- -->
<script>
  import { onMount } from "svelte";
  import Card from "$shared/components/Card.svelte";
  import { store, uid, fmtBytes, num } from "$shared/lib/net.js";
  import Icon from "$shared/components/Icon.svelte";

  // Mirrors joule::NetState in JouleNet.h — /wifi/status sends the raw enum.
  const STATES = [
    { label: "Idle",         tone: "muted" },
    { label: "Connecting",   tone: "warn"  },
    { label: "Connected",    tone: "ok"    },
    { label: "Setup portal", tone: "info"  },
    { label: "Failed",       tone: "err"   },
  ];

  let tab        = $state("wifi");
  let tabTouched = $state(false);   // operator picked a tab → stop applying the firmware default
  let hideWifi   = $state(false);   // firmware-driven: AP-only appliance hides the Wi-Fi picker
  let uiReady    = $state(false);   // first /wifi/status attempt has completed

  let networks   = $state([]);
  let scanning   = $state(true);
  let selected   = $state(null);
  let pwd        = $state("");
  let showPwd    = $state(false);
  let hiddenSsid = $state("");
  let host = $state(""), cc = $state(""), sip = $state(""), sgw = $state(""), smask = $state("");
  let connecting = $state(false);

  let params      = $state([]);
  let paramValues = $state({});
  let saving      = $state(false);
  let copiedKey   = $state(null);   // which Display field just flashed "copied"

  let status = $state(null);
  let toasts = $state([]);
  let theme  = $state(store.get("vecti-theme", "auto"));

  // Every setTimeout lands here so unmount can cancel it. Toasts and the
  // copy-confirmation flash used to leave timers running against a destroyed
  // component, which throws on the next tick after navigation.
  const timers = new Set();
  function later(fn, ms) {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  }

  $effect(() => document.documentElement.setAttribute("data-theme", theme));
  function cycleTheme() {
    theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    store.set("vecti-theme", theme);
  }

  // Tab set is firmware-shaped: AP-only setup appliances hide the Wi-Fi picker
  // (setUiHideWifiTab) so the operator only sees Setup + Status.
  let tabs  = $derived([
    ...(hideWifi ? [] : [["wifi", "Wi-Fi"]]),
    ["params", "Setup"],
    ["status", "Status"],
  ]);
  let title = $derived(status?.title || "VectiNet");
  let conn  = $derived(STATES[status?.state] ?? { label: "Not connected", tone: "muted" });

  function toast(msg, kind = "info") {
    // uid(), never crypto.randomUUID(): that is secure-context only and is
    // undefined at http://192.168.4.1, so it threw on every real device.
    const t = { id: uid(), msg, kind };
    toasts = [...toasts, t];
    later(() => (toasts = toasts.filter(x => x.id !== t.id)), 2600);
  }

  // ---- tabs ---------------------------------------------------------------
  function pick(k) {
    tabTouched = true;
    tab = k;
    if (k === "params") loadParams();
    if (k === "status") loadStatus();
    // Roving tabindex: the selected tab is the only focusable one, so focus
    // has to travel with the selection or a keyboard user is stranded on an
    // element that is now tabindex="-1".
    queueMicrotask(() => document.getElementById(`tab-${k}`)?.focus());
  }
  function onTabKey(e) {
    const i = tabs.findIndex(([k]) => k === tab);
    const go = (n) => { e.preventDefault(); pick(tabs[(n + tabs.length) % tabs.length][0]); };
    if (e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(tabs.length - 1);
  }

  // ---- device I/O ---------------------------------------------------------
  async function scan(retry = true) {
    scanning = true;
    try {
      const r = await fetch("/wifi/scan", { cache: "no-store" });
      const j = await r.json();
      networks = (j.networks || []).sort((a, b) => b.rssi - a.rssi);
      // The handler answers immediately and kicks the real scan off async, so
      // a cold first request is always empty. Ask once more before giving up.
      if (!networks.length && retry) {
        await new Promise(res => setTimeout(res, 1200));
        await scan(false);
      }
    } catch { toast("Scan failed", "err"); }
    finally { scanning = false; }
  }

  async function loadStatus() {
    try {
      const r = await fetch("/wifi/status", { cache: "no-store" });
      const j = await r.json();
      if (j.title) document.title = j.title;
      if (j.brand) {
        document.documentElement.style.setProperty("--color-brand", j.brand);
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", j.brand);
      }
      status = j;
      // The first status response carries the firmware's UX hints. Apply them
      // once: hide the Wi-Fi tab if asked, and open on the preferred tab
      // unless the operator has already navigated.
      if (!uiReady) {
        hideWifi = !!j.uiHideWifi;
        const want = j.uiDefaultTab;
        if (!tabTouched && ["wifi", "params", "status"].includes(want)
            && !(want === "wifi" && hideWifi)) tab = want;
        if (hideWifi && tab === "wifi") tab = "params";
        if (tab === "params") loadParams();
      }
    } catch { /* device rebooting or the link flipped — the poll retries */ }
    // Reveal the UI after the first attempt even when it FAILED, falling back
    // to the default (Wi-Fi-visible) layout. That stops both a flash of the
    // wrong tab and a status hiccup pinning the page on a spinner forever.
    finally { uiReady = true; }
  }

  async function loadParams() {
    try {
      const r = await fetch("/wifi/params", { cache: "no-store" });
      const j = await r.json();
      params = j.params || [];
      const v = {};
      for (const p of params) v[p.key] = p.value;
      paramValues = v;
    } catch { toast("Could not load settings", "err"); }
  }

  async function saveParams() {
    saving = true;
    try {
      const r = await fetch("/wifi/params", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paramValues),
      });
      toast(r.ok ? "Settings saved" : `Save failed (HTTP ${r.status})`, r.ok ? "ok" : "err");
    } catch { toast("Could not reach the device", "err"); }
    finally { saving = false; }
  }

  async function connect() {
    const ssid = selected?.ssid || hiddenSsid.trim();
    if (!ssid) { toast("Pick a network first", "err"); return; }
    connecting = true;
    try {
      const r = await fetch("/wifi/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ssid, password: pwd, hidden: !selected && !!hiddenSsid.trim(),
          hostname: host, countryCode: cc,
          staticIp: sip, gateway: sgw, netmask: smask,
        }),
      });
      toast(r.ok ? "Connecting — watch the Status tab" : `Rejected (HTTP ${r.status})`,
            r.ok ? "ok" : "err");
    } catch {
      // Expected on success too: the radio leaves the AP to join the target,
      // which kills this very socket. Say so rather than looking broken.
      toast("Link dropped — reconnect and check Status", "warn");
    } finally { connecting = false; }
  }

  async function post(path, okMsg) {
    try {
      const r = await fetch(path, { method: "POST" });
      toast(r.ok ? okMsg : `Failed (HTTP ${r.status})`, r.ok ? "ok" : "err");
    } catch { toast(okMsg, "warn"); }   // the device rebooted mid-response
  }
  const restart = () => post("/wifi/restart", "Restarting");
  function erase() {
    if (!confirm("Erase ALL Wi-Fi credentials + settings, then reboot?")) return;
    post("/wifi/reset", "Erased — rebooting");
  }

  // Copy a read-only Display value. The async Clipboard API only works in a
  // secure context — a captive portal at http://192.168.4.1 is NOT one — so
  // fall back to the legacy execCommand path, and finally to a "select it
  // yourself" hint. The field itself is select-all for that last resort.
  async function copyVal(key, val) {
    const text = (val ?? "").toString();
    const flash = () => { copiedKey = key; later(() => { if (copiedKey === key) copiedKey = null; }, 1400); };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        flash();
        return;
      }
    } catch { /* fall through to execCommand */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) flash(); else toast("Select & copy manually", "err");
    } catch { toast("Select & copy manually", "err"); }
  }

  onMount(() => {
    let statusTimer;
    // Status FIRST, so we know whether the Wi-Fi tab exists before deciding to
    // scan. A scan in SoftAP mode hops channels and can drop the very phone
    // the operator is configuring from — so an AP-only appliance never scans.
    loadStatus().then(() => {
      if (!hideWifi) scan(); else scanning = false;
      statusTimer = setInterval(() => { if (tab === "status") loadStatus(); }, 3000);
    });
    return () => {
      clearInterval(statusTimer);
      timers.forEach(clearTimeout);
      timers.clear();
    };
  });

  /** 0–4 signal bars. Never the sole carrier of meaning — the dBm figure is
   *  always printed next to it. */
  const bars = (rssi) => Math.max(0, Math.min(4, Math.round((num(rssi, -100) + 90) / 10)));

  function fmtUptime(s) {
    s = num(s);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`;
  }

  const STATUS_ROWS = $derived(status ? [
    ["SSID",      status.ssid || "—"],
    ["IP",        status.ip],
    ["Gateway",   status.gateway],
    ["Netmask",   status.mask],
    ["DNS",       status.dns],
    ["BSSID",     status.bssid],
    ["Channel",   status.channel],
    ["Signal",    `${status.rssi} dBm`],
    ["Hostname",  status.hostname],
    ["mDNS",      status.mdns],
    ["MAC",       status.mac],
    ["Free heap", fmtBytes(status.heap)],
    ["Uptime",    fmtUptime(status.uptime_s)],
  ] : []);
</script>

<a href="#main" class="skip">Skip to content</a>

<header class="hdr">
  <div class="wrap hdr-in">
    <span class="mark" aria-hidden="true"><Icon name="Wifi" size={15} strokeWidth={2.4}/></span>
    <div class="ident">
      <h1>{title}</h1>
      <p>{status?.state === 2 && status.ssid ? `Joined ${status.ssid}` : "Wi-Fi provisioning"}</p>
    </div>
    <span class="pill" data-tone={conn.tone} aria-live="polite">
      <i aria-hidden="true"></i>{conn.label}
    </span>
    <button class="icon-btn" onclick={cycleTheme}
            aria-label="Theme: {theme}. Click to change." title="Theme: {theme}">
      {#if theme === "light"}<Icon name="Sun" size={16}/>{:else if theme === "dark"}<Icon name="Moon" size={16}/>{:else}<Icon name="Monitor" size={16}/>{/if}
    </button>
  </div>
</header>

<main id="main" class="wrap">
  {#if !uiReady}
    <!-- Held until the firmware's UX hints land, so the tab strip never
         reshuffles under the operator's thumb. -->
    <p class="boot" role="status" aria-live="polite">
      <span class="spin on" aria-hidden="true"><Icon name="RefreshCw" size={18}/></span> Contacting device…
    </p>
  {:else}
    <div class="tabs" role="tablist" aria-label="Portal sections">
      {#each tabs as [k, label] (k)}
        <button role="tab" id="tab-{k}" class="tab" class:on={tab === k}
                aria-controls="panel" aria-selected={tab === k}
                tabindex={tab === k ? 0 : -1}
                onclick={() => pick(k)} onkeydown={onTabKey}>{label}</button>
      {/each}
    </div>

    <div class="grid" id="panel" role="tabpanel" aria-labelledby="tab-{tab}" tabindex="-1">
      {#if tab === "wifi"}
        <Card span={12} label="Available networks">
          <div class="sec-head">
            <p class="hint">Tap a network, then enter its password below.</p>
            <button class="btn ghost sm" onclick={() => scan()} disabled={scanning}>
              <span class="spin" class:on={scanning}><Icon name="RefreshCw" size={13}/></span>
              {scanning ? "Scanning…" : "Rescan"}
            </button>
          </div>

          {#if scanning && !networks.length}
            <div class="nets" aria-hidden="true">
              {#each [0, 1, 2, 3] as i (i)}<div class="skel"></div>{/each}
            </div>
            <p class="sr-only" role="status" aria-live="polite">Scanning for networks</p>
          {:else if !networks.length}
            <p class="empty">No networks found — move closer and rescan.</p>
          {:else}
            <div class="nets">
              {#each networks as n (n.bssid)}
                {@const b = bars(n.rssi)}
                <button class="net" aria-pressed={selected?.bssid === n.bssid}
                        onclick={() => (selected = n)}>
                  <svg class="sig" viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
                    {#each [0, 1, 2, 3] as i (i)}
                      <rect x={i * 5} y={12 - (i + 1) * 3} width="3" height={(i + 1) * 3} rx="1"
                            fill={i < b ? "var(--color-brand)" : "var(--color-line)"}/>
                    {/each}
                  </svg>
                  <span class="net-b">
                    <span class="net-n">{n.ssid || "(hidden network)"}</span>
                    <span class="net-m tnum">ch {n.ch} · {n.rssi} dBm · {n.bssid}</span>
                  </span>
                  {#if n.sec}
                    <Icon name="Lock" size={13} aria-hidden="true"/><span class="sr-only">secured</span>
                  {:else}
                    <span class="sr-only">open network</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </Card>

        <Card span={12} label="Join">
          <div class="fld">
            <label for="pwd">Password</label>
            <div class="pwd">
              <!-- One-way binding: Svelte forbids bind:value when `type` is
                   dynamic, which the show/hide toggle needs. -->
              <input id="pwd" type={showPwd ? "text" : "password"} value={pwd}
                     autocomplete="current-password" autocapitalize="off" spellcheck="false"
                     placeholder="leave empty for open networks"
                     oninput={(e) => (pwd = e.currentTarget.value)}/>
              <button type="button" class="eye" aria-pressed={showPwd}
                      aria-label={showPwd ? "Hide password" : "Show password"}
                      onclick={() => (showPwd = !showPwd)}>
                {#if showPwd}<Icon name="EyeOff" size={15}/>{:else}<Icon name="Eye" size={15}/>{/if}
              </button>
            </div>
          </div>

          <div class="fld">
            <label for="hidden-ssid">Or join a hidden SSID</label>
            <input id="hidden-ssid" bind:value={hiddenSsid} autocapitalize="off"
                   spellcheck="false" placeholder="network name"/>
          </div>

          <details class="adv">
            <summary>Advanced — static IP, hostname, country</summary>
            <div class="fld">
              <label for="host">Hostname (mDNS)</label>
              <input id="host" bind:value={host} placeholder="vecti" autocapitalize="off" spellcheck="false"/>
            </div>
            <div class="duo">
              <div class="fld">
                <label for="cc">Country code</label>
                <input id="cc" bind:value={cc} maxlength="2" placeholder="IN" autocapitalize="characters"/>
              </div>
              <div class="fld">
                <label for="sip">Static IP</label>
                <input id="sip" bind:value={sip} inputmode="decimal" placeholder="(DHCP)"/>
              </div>
              <div class="fld">
                <label for="sgw">Gateway</label>
                <input id="sgw" bind:value={sgw} inputmode="decimal" placeholder="192.168.1.1"/>
              </div>
              <div class="fld">
                <label for="smask">Netmask</label>
                <input id="smask" bind:value={smask} inputmode="decimal" placeholder="255.255.255.0"/>
              </div>
            </div>
            <p class="hint">All three of IP, gateway and netmask are needed; leave any blank for DHCP.</p>
          </details>

          <div class="btn-row">
            <button class="btn primary" onclick={connect} disabled={connecting}>
              {#if connecting}
                <span class="spin on"><Icon name="RefreshCw" size={15}/></span> Connecting…
              {:else}
                <Icon name="Power" size={15}/> Connect
              {/if}
            </button>
          </div>
        </Card>

      {:else if tab === "params"}
        <Card span={12} label="Device settings">
          {#if !params.length}
            <p class="empty">No custom parameters defined by this firmware.</p>
          {:else}
            {#each params as p, i (p.key + i)}
              {#if p.type === "header"}
                <h3 class="sec">{p.label}</h3>
              {:else if p.type === "divider"}
                <hr/>
              {:else if p.type === "toggle"}
                <div class="fld sw-fld">
                  <label for="p-{p.key}">{p.label}</label>
                  <input id="p-{p.key}" class="sw" type="checkbox" role="switch"
                         checked={paramValues[p.key] === "1"}
                         onchange={(e) => (paramValues[p.key] = e.currentTarget.checked ? "1" : "0")}/>
                </div>
              {:else if p.type === "display"}
                <div class="fld">
                  <label for="p-{p.key}">{p.label}</label>
                  <div class="disp">
                    <output id="p-{p.key}">{p.value || "—"}</output>
                    <button type="button" class="copy" onclick={() => copyVal(p.key, p.value)}
                            data-done={copiedKey === p.key} aria-label="Copy {p.label}">
                      {#if copiedKey === p.key}<Icon name="Check" size={15}/>{:else}<Icon name="Copy" size={14}/>{/if}
                    </button>
                  </div>
                </div>
              {:else}
                <div class="fld">
                  <label for="p-{p.key}">{p.label}</label>
                  {#if p.type === "password"}
                    <input id="p-{p.key}" type="password" bind:value={paramValues[p.key]}
                           placeholder={p.hint} autocomplete="off"/>
                  {:else if p.type === "number"}
                    <!-- min/max default to 0/0 in NetParam; emitting max="0"
                         made every number field un-editable. -->
                    <input id="p-{p.key}" type="number" bind:value={paramValues[p.key]}
                           min={p.min === p.max ? undefined : p.min}
                           max={p.min === p.max ? undefined : p.max} placeholder={p.hint}/>
                  {:else if p.type === "dropdown"}
                    <select id="p-{p.key}" bind:value={paramValues[p.key]}>
                      {#each (p.opts || "").split("|") as o (o)}<option value={o}>{o}</option>{/each}
                    </select>
                  {:else if p.type === "color"}
                    <input id="p-{p.key}" class="col" type="color" bind:value={paramValues[p.key]}/>
                  {:else if p.type === "textarea"}
                    <textarea id="p-{p.key}" rows="4" bind:value={paramValues[p.key]} placeholder={p.hint}></textarea>
                  {:else}
                    <input id="p-{p.key}" bind:value={paramValues[p.key]} placeholder={p.hint}/>
                  {/if}
                </div>
              {/if}
            {/each}

            <div class="btn-row">
              <button class="btn primary" onclick={saveParams} disabled={saving}>
                <Icon name="Save" size={15}/> {saving ? "Saving…" : "Save settings"}
              </button>
            </div>
          {/if}
        </Card>

      {:else}
        <Card span={12} label="Connection">
          {#if !status}
            <p class="empty">Waiting for the device…</p>
          {:else}
            <p><span class="pill" data-tone={conn.tone}><i aria-hidden="true"></i>{conn.label}</span></p>
            <dl class="rows">
              {#each STATUS_ROWS as [k, v] (k)}
                <div class="row"><dt>{k}</dt><dd class="tnum">{v ?? "—"}</dd></div>
              {/each}
            </dl>
          {/if}
        </Card>

        <Card span={12} label="Maintenance">
          <p class="hint">
            Restart reboots the device and keeps its settings. Erase wipes every
            saved network and custom parameter, then reboots into the portal.
          </p>
          <div class="btn-row">
            <button class="btn ghost" onclick={restart}><Icon name="RefreshCw" size={15}/> Restart</button>
            <button class="btn danger" onclick={erase}><Icon name="Trash2" size={15}/> Erase &amp; reboot</button>
          </div>
        </Card>
      {/if}
    </div>
  {/if}
</main>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as t (t.id)}<div class="toast" data-k={t.kind}>{t.msg}</div>{/each}
</div>

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
.pill[data-tone="info"] { color: var(--color-info); }

.icon-btn { display: grid; place-items: center; width: 32px; height: 32px; flex: none;
            border: 0; background: none; color: var(--color-muted); cursor: pointer;
            border-radius: 8px; }
.icon-btn:hover { color: var(--color-ink); background: var(--color-bg-soft); }

.grid { display: grid; grid-template-columns: repeat(12, minmax(0,1fr));
        gap: 12px; padding-bottom: 40px; }
.grid:focus { outline: none; }

.boot { display: flex; align-items: center; justify-content: center; gap: 10px;
        padding: 80px 0; color: var(--color-muted); font-size: 13.5px; }

.tabs { display: flex; gap: 4px; margin: 16px 0 12px; padding: 3px;
        border-radius: var(--radius-ctl);
        background: var(--color-bg-soft); border: 1px solid var(--color-line-soft); }
.tab { flex: 1; padding: 7px 10px; border: 0; border-radius: 7px; cursor: pointer;
       font: inherit; font-size: 13px; font-weight: 600; color: var(--color-muted);
       background: none; }
.tab.on { background: var(--color-panel); color: var(--color-ink); box-shadow: var(--shadow-card); }

.hint  { margin: 0; font-size: 12.5px; color: var(--color-muted); }
.empty { margin: 0; padding: 18px 0; text-align: center;
         font-size: 13px; color: var(--color-muted); }
.sec   { margin: 10px 0 2px; font-size: 11px; font-weight: 700; letter-spacing: .06em;
         text-transform: uppercase; color: var(--color-brand); }
hr     { border: 0; border-top: 1px solid var(--color-line); margin: 12px 0; }

.sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px;
            flex-wrap: wrap; }

/* Spin the wrapper, not the icon: scoped CSS can't reach inside a component. */
.spin { display: inline-grid; place-items: center; flex: none; }
.spin.on { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.nets { display: grid; gap: 6px; }
.skel { height: 46px; border-radius: var(--radius-ctl);
        background: linear-gradient(90deg, var(--color-bg-soft) 0%,
                    var(--color-line-soft) 50%, var(--color-bg-soft) 100%);
        background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }

.net { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
       padding: 8px 10px; cursor: pointer; font: inherit; color: var(--color-ink);
       background: var(--color-panel-2); border: 1px solid var(--color-line-soft);
       border-radius: var(--radius-ctl); }
.net:hover { border-color: var(--color-brand); }
.net[aria-pressed="true"] { border-color: var(--color-brand);
       background: color-mix(in srgb, var(--color-brand) 8%, transparent); }
.sig  { flex: none; }
.net-b { flex: 1; min-width: 0; display: grid; gap: 1px; }
.net-n { font-size: 14px; font-weight: 600;
         overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.net-m { font-family: var(--font-mono); font-size: 11px; color: var(--color-muted);
         overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.fld { display: grid; gap: 5px; }
.fld > label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
               font-weight: 600; color: var(--color-muted); }
.fld input, .fld select, .fld textarea, .disp output {
  width: 100%; padding: 9px 11px; font: inherit; font-size: 13.5px;
  color: var(--color-ink); background: var(--color-panel-2);
  border: 1px solid var(--color-line); border-radius: var(--radius-ctl);
}
.fld textarea, .disp output { font-family: var(--font-mono); font-size: 12.5px; resize: vertical; }
.fld input:focus, .fld select:focus, .fld textarea:focus {
  outline: 2px solid var(--color-brand); outline-offset: 1px; border-color: transparent; }
.fld select { cursor: pointer; }
.fld input.col { width: 56px; padding: 4px; height: 38px; cursor: pointer; }

.duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }

.pwd { position: relative; display: flex; }
.pwd input { padding-right: 42px; }
.eye { position: absolute; right: 1px; top: 1px; bottom: 1px; width: 38px;
       display: grid; place-items: center; border: 0; background: none;
       color: var(--color-muted); cursor: pointer; border-radius: var(--radius-ctl); }
.eye:hover { color: var(--color-brand); }

/* Native checkbox re-skinned as a switch: keeps keyboard + AT semantics free. */
.sw-fld { grid-template-columns: 1fr auto; align-items: center; }
.sw { appearance: none; -webkit-appearance: none; width: 42px; height: 24px; padding: 0;
      flex: none; position: relative; cursor: pointer; border-radius: 99px;
      background: var(--color-bg-soft); border: 1px solid var(--color-line);
      transition: background .15s, border-color .15s; }
.sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
             border-radius: 50%; background: var(--color-muted); transition: transform .15s, background .15s; }
.sw:checked { background: var(--color-brand); border-color: var(--color-brand); }
.sw:checked::after { transform: translateX(18px); background: #fff; }

.disp { display: flex; align-items: stretch; gap: 8px; }
.disp output { flex: 1; min-width: 0; line-height: 1.5; overflow-wrap: anywhere;
               user-select: all; -webkit-user-select: all; }
.copy { flex: none; width: 42px; display: grid; place-items: center; cursor: pointer;
        color: var(--color-muted); background: var(--color-panel);
        border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }
.copy:hover { color: var(--color-brand); border-color: var(--color-brand); }
.copy[data-done="true"] { color: var(--color-ok); border-color: var(--color-ok); }

.adv summary { cursor: pointer; font-size: 12.5px; font-weight: 600;
               color: var(--color-brand); padding: 4px 0; }
.adv > :not(summary) { margin-top: 8px; }

.rows { display: grid; gap: 6px; margin: 0;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
.row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
       padding: 8px 10px; border-radius: var(--radius-ctl); background: var(--color-panel-2);
       border: 1px solid var(--color-line-soft); min-width: 0; }
.row dt { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
          font-weight: 600; color: var(--color-muted); flex: none; }
.row dd { margin: 0; font-family: var(--font-mono); font-size: 12.5px; font-weight: 600;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.btn-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
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
.btn.sm { min-width: 0; padding: 5px 10px; font-size: 12.5px; }

.toasts { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
          display: grid; gap: 8px; z-index: 60; pointer-events: none;
          padding-bottom: env(safe-area-inset-bottom); }
.toast { padding: 9px 14px; font-size: 13px; font-weight: 600;
         background: var(--color-panel); color: var(--color-ink);
         border: 1px solid var(--color-line); border-radius: var(--radius-ctl);
         box-shadow: var(--shadow-pop); }
.toast[data-k="ok"]   { border-color: var(--color-ok);   color: var(--color-ok); }
.toast[data-k="warn"] { border-color: var(--color-warn); color: var(--color-warn); }
.toast[data-k="err"]  { border-color: var(--color-err);  color: var(--color-err); }
</style>
