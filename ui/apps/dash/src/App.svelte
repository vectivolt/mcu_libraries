<!-- ---------------------------------------------------------------------------
  VectiDash — real-time device dashboard SPA. Svelte 5 + Tailwind v4.
  (c) 2026 VectiVolt — Apache-2.0 License
--------------------------------------------------------------------------- -->
<script>
  import { onMount } from "svelte";
  import Card from "$shared/components/Card.svelte";
  import StatusDot from "$shared/components/StatusDot.svelte";
  import Sparkline from "$shared/components/Sparkline.svelte";
  import { uid, store, num, clamp01, reconnectingSocket } from "$shared/lib/net.js";
  import Icon from "$shared/components/Icon.svelte";
  import { WIDGETS, BARE } from "$shared/widgets/index.js";

  let sock       = null;
  let layout     = $state(null);
  let values     = $state({});
  let trend      = $state({});        // id → recent numbers, for the sparklines
  let currentTab = $state(null);
  let connected  = $state(false);
  let toasts     = $state([]);
  let theme      = $state(store.get("vecti-theme", "auto"));
  let viewport   = $state("desktop");
  let menuOpen   = $state(false);

  // Toast timers, so unmount doesn't leave callbacks pointed at a dead component.
  const timers = new Set();

  $effect(() => document.documentElement.setAttribute("data-theme", theme));
  function cycleTheme() {
    theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    store.set("vecti-theme", theme);
  }

  function handle(m) {
    if (m.type === "layout") {
      layout = m;
      if (m.title) document.title = m.title;
      if (m.brand) {
        document.documentElement.style.setProperty("--color-brand", m.brand);
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", m.brand);
      }
      const tabs = m.tabs || [];
      if (!currentTab || !tabs.includes(currentTab)) {
        const want = decodeURIComponent((location.hash || "").replace(/^#/, "")).toLowerCase();
        currentTab = tabs.find(t => t.toLowerCase() === want) || tabs[0] || "Main";
      }
    } else if (m.type === "upd") {
      for (const c of m.cards || []) {
        values[c.id] = c.value;
        const n = parseFloat(c.value);
        if (Number.isFinite(n)) trend[c.id] = [...(trend[c.id] || []), n].slice(-32);
      }
    } else if (m.type === "notify") {
      // uid(), not crypto.randomUUID(): this page is served over plain http://
      // from the device's IP, which is not a secure context, so randomUUID is
      // undefined there and every notification threw.
      const t = { id: uid(), level: m.level || "info", msg: m.message, };
      toasts = [...toasts, t];
      const h = setTimeout(() => {
        toasts = toasts.filter(x => x.id !== t.id);
        timers.delete(h);
      }, m.ttl || 4500);
      timers.add(h);
    }
  }

  // `window.history`, spelled out. A local `let history = $state({})` used to
  // shadow it here, so every tab click threw "history.replaceState is not a
  // function" and the dashboard was stuck on tab one.
  function pickTab(t) {
    currentTab = t;
    menuOpen = false;
    try { window.history.replaceState(null, "", `#${encodeURIComponent(t)}`); } catch { /* file:// */ }
  }

  const send = (o) => sock?.send(o);
  const onCmd = (id, v) => send({ type: "cmd", id, value: String(v) });

  onMount(() => {
    sock = reconnectingSocket("/dash/ws", {
      onMessage: handle,
      onOpen:  () => { connected = true; send({ type: "hello" }); },
      onClose: () => (connected = false),
    });

    const onResize = () => {
      const w = window.innerWidth;
      // 448 covers the widest phones in portrait (iPhone Pro Max is 430).
      viewport = w <= 448 ? "small" : w <= 800 ? "tablet" : "desktop";
      if (viewport !== "small") menuOpen = false;
    };
    onResize();
    window.addEventListener("resize", onResize);

    const onKey = (e) => { if (e.key === "Escape") menuOpen = false; };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      timers.forEach(clearTimeout); timers.clear();
      sock?.close();
    };
  });

  let tabs = $derived(layout?.tabs || []);

  // A card whose tab is unset, or names a tab the firmware never registered,
  // lands on the first tab rather than on a phantom "Main" that appears in no
  // tab strip — cards used to vanish with no way to reach them.
  const tabOf = (c) => (tabs.includes(c.tab) ? c.tab : (tabs[0] || "Main"));
  let visibleCards = $derived(
    (layout?.cards || []).filter(c => !c.hidden && tabOf(c) === currentTab)
  );

  // Card width in 12-column units for the current viewport.
  //
  // Tablet snaps to halves or full rather than simply doubling the declared
  // width: doubling turned a 4-wide card into an 8, which left a 4-column
  // gap on every row because nothing else was narrow enough to fill it.
  function spanFor(c) {
    const wide = c.type === "chart" || c.type === "custom";
    const base = c.width || (wide ? 12 : 3);
    if (viewport === "small")  return wide || base >= 12 ? 12 : 6;
    if (viewport === "tablet") return wide || base > 3 ? 12 : 6;
    return base;
  }

  function statusKind(v) {
    const s = String(v ?? "").toLowerCase();
    if (/^(ok|online|connect|valid|success|live|good|ready)/.test(s)) return "ok";
    if (/warn|degrad|pending/.test(s)) return "warn";
    if (/err|off|fail|invalid|fault|alarm/.test(s)) return "err";
    return "muted";
  }

  // Icon + tone by card id. Anchored patterns so "up" doesn't match "supply"
  // and "i1" doesn't match every id containing an i.
  const DECOR = [
    [/^(pwr|power)|kw$/,        "info",    "Zap"],
    [/^(kwh|energy)/,           "success", "BatteryCharging"],
    [/^cost|price/,             "primary", "IndianRupee"],
    [/^(sess|time|up|uptime)$/, null,      "Clock"],
    [/^(tmp|temp)/,             "warning", "Thermometer"],
    [/^hum/,                    "info",    "Droplets"],
    [/^(rssi|net|wifi)/,        null,      "Wifi"],
    [/^heap|^mem/,              null,      "Cpu"],
    [/^v\d|^volt/,              "info",    "Zap"],
    [/^i\d|^cur|^amp/,          "warning", "Bolt"],
    [/^f$|^freq/,               null,      "Activity"],
    [/^cpu|^load/,              null,      "Gauge"],
  ];
  function decor(c) {
    const id = String(c.id || "").toLowerCase();
    for (const [re, tone, icon] of DECOR) {
      if (re.test(id)) return { color: tone || c.color || "default", icon };
    }
    return { color: c.color || "default", icon: null };
  }

  // ---- chart -------------------------------------------------------------
  // SVG, not canvas. Canvas has to be told what colour to use, which meant
  // reading getComputedStyle at draw time and repainting only when a
  // ResizeObserver fired — so a theme toggle left the old palette on screen
  // until something resized the card. stroke="var(--color-brand)" re-resolves
  // itself the moment data-theme flips, and the viewBox handles resize for
  // free, so the observer goes too.
  const CW = 300, CH = 170, CP = 5;
  const CGRID = [1, 2, 3]
    .map((i) => `M${CP} ${CP + (i * (CH - CP * 2)) / 4}H${CW - CP}`).join("");

  function chartOf(raw) {
    let xs = [], ys = [];
    try {
      const j = typeof raw === "string" ? JSON.parse(raw) : raw;
      xs = j?.x || []; ys = j?.y || [];
    } catch { return null; }
    if (ys.length < 2) return null;

    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const yRng = (yMax - yMin) || 1;
    // Honour the x series when the device sent one. The previous build spaced
    // points evenly by index, so a chart with irregular timestamps drew a
    // shape that did not match the data.
    const useX = xs.length === ys.length;
    const xMin = useX ? Math.min(...xs) : 0;
    const xRng = useX ? (Math.max(...xs) - xMin) || 1 : (ys.length - 1) || 1;

    const px = (i) => (CP + ((useX ? xs[i] - xMin : i) / xRng) * (CW - CP * 2)).toFixed(1);
    const py = (v) => (CH - CP - ((v - yMin) / yRng) * (CH - CP * 2)).toFixed(1);

    const line = ys.map((v, i) => `${i ? "L" : "M"}${px(i)} ${py(v)}`).join("");
    const last = ys.length - 1;
    return {
      line,
      area: `${line}L${px(last)} ${CH - CP}L${px(0)} ${CH - CP}Z`,
      // Zero-length subpath; .cd gives it a round cap, which paints a real
      // circle. A <circle> would come out an ellipse under
      // preserveAspectRatio="none".
      dot: `M${px(last)} ${py(ys[last])}h0`,
    };
  }

  function joystick(el, id) {
    const nub = el.querySelector(".nub");
    let active = false;
    const R = 46;
    const move = (cx, cy) => {
      const b = el.getBoundingClientRect();
      const dx = (cx - b.left - b.width / 2) / (b.width / 2);
      const dy = (cy - b.top - b.height / 2) / (b.height / 2);
      const mag = Math.min(1, Math.hypot(dx, dy)), ang = Math.atan2(dy, dx);
      const x = Math.cos(ang) * mag, y = Math.sin(ang) * mag;
      nub.style.transform = `translate(${x * R}px, ${y * R}px)`;
      onCmd(id, `${Math.round(x * 100)},${-Math.round(y * 100)}`);
    };
    const reset = () => { active = false; nub.style.transform = "translate(0,0)"; onCmd(id, "0,0"); };
    const down = (e) => { active = true; el.setPointerCapture(e.pointerId); move(e.clientX, e.clientY); };
    const drag = (e) => { if (active) move(e.clientX, e.clientY); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", drag);
    el.addEventListener("pointerup", reset);
    el.addEventListener("pointercancel", reset);
    return { destroy() {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", drag);
      el.removeEventListener("pointerup", reset);
      el.removeEventListener("pointercancel", reset);
    } };
  }

  const frac = (v, c) => clamp01((num(v) - num(c.min, 0)) / ((num(c.max, 100) - num(c.min, 0)) || 1));

  /**
   * Push the card's value into the `<span id="dash-<id>-out">` that a custom
   * snippet may declare. textContent, never innerHTML — the snippet is
   * firmware-authored but the VALUE routinely carries live readings, and
   * those must never be parsed as markup.
   */
  function customOut(node, { id, value }) {
    const paint = (v) => {
      const el = node.querySelector(`#dash-${CSS.escape(id)}-out`);
      if (el && el.textContent !== String(v)) el.textContent = String(v);
    };
    paint(value);
    return { update({ value: v }) { paint(v); } };
  }
</script>

<a href="#main" class="skip">Skip to content</a>

<header class="hdr">
  <div class="wrap hdr-in">
    <span class="mark" aria-hidden="true"><Icon name="Zap" size={15} strokeWidth={2.4}/></span>
    <div class="ident">
      <h1>{layout?.title || "VectiDash"}</h1>
      <p>{currentTab || "live dashboard"}</p>
    </div>
    <span class="pill" data-tone={connected ? "ok" : "muted"} aria-live="polite">
      <i aria-hidden="true"></i>{connected ? "Online" : "Reconnecting"}
    </span>
    <button class="icon-btn" onclick={cycleTheme} aria-label="Theme: {theme}. Click to change.">
      {#if theme === "light"}<Icon name="Sun" size={16}/>{:else if theme === "dark"}<Icon name="Moon" size={16}/>{:else}<Icon name="Monitor" size={16}/>{/if}
    </button>
    {#if viewport === "small" && tabs.length > 1}
      <button class="icon-btn" onclick={() => (menuOpen = true)}
              aria-label="Open tab menu" aria-expanded={menuOpen}><Icon name="Menu" size={18}/></button>
    {/if}
  </div>

  {#if tabs.length > 1 && viewport !== "small"}
    <!-- div, not nav: a tablist is its own landmark role and nesting it in a
         nav gives assistive tech two competing roles for one control. -->
    <div class="wrap tabs" role="tablist" aria-label="Dashboard tabs">
      {#each tabs as t (t)}
        <button role="tab" class="tab" class:on={t === currentTab}
                aria-selected={t === currentTab} tabindex={t === currentTab ? 0 : -1}
                onclick={() => pickTab(t)}
                onkeydown={(e) => {
                  const i = tabs.indexOf(currentTab);
                  if (e.key === "ArrowRight") pickTab(tabs[(i + 1) % tabs.length]);
                  else if (e.key === "ArrowLeft") pickTab(tabs[(i - 1 + tabs.length) % tabs.length]);
                }}>{t}</button>
      {/each}
    </div>
  {/if}
</header>

{#if viewport === "small" && tabs.length > 1}
  <div class="scrim" class:on={menuOpen} onclick={() => (menuOpen = false)} aria-hidden="true"></div>
  <aside class="drawer" class:on={menuOpen} aria-label="Tabs" aria-hidden={!menuOpen}>
    <div class="drawer-hd">
      <span>Tabs</span>
      <button class="icon-btn" onclick={() => (menuOpen = false)} aria-label="Close menu"><Icon name="X" size={16}/></button>
    </div>
    <nav>
      {#each tabs as t (t)}
        <button class="drawer-item" class:on={t === currentTab}
                tabindex={menuOpen ? 0 : -1} onclick={() => pickTab(t)}>{t}</button>
      {/each}
    </nav>
  </aside>
{/if}

<main id="main" class="wrap grid">
  {#each visibleCards as c (c.id)}
    {@const v = values[c.id] ?? c.value ?? ""}
    {@const d = decor(c)}
    {#if BARE.has(c.type)}
      {@const Bare = WIDGETS[c.type]}
      <div class="bare" style:grid-column={`span ${spanFor(c)}`}>
        <Bare card={c} value={v} cmd={(x) => onCmd(c.id, x)} />
      </div>
    {:else}
    <Card color={c.color && c.color !== "default" ? c.color : d.color}
          icon={d.icon} span={spanFor(c)} label={c.label || c.id}>

      {#if c.type === "number" || c.type === "temperature" || c.type === "humidity"}
        <div class="kpi">
          <span class="kpi-v tnum">{v === "" ? "—" : v}{#if c.unit}<em>{c.unit}</em>{/if}</span>
          {#if trend[c.id]?.length > 1}
            <span class="kpi-spark"><Sparkline data={trend[c.id]} height={30}/></span>
          {/if}
        </div>

      {:else if c.type === "button"}
        <!-- A button inherits its card's semantic colour. Rendering a card
             declared DashColor::Danger (an E-STOP) in the same brand green as
             every benign action is a safety problem, not a styling nit. -->
        <button class="w-btn" data-tone={c.color || "default"}
                onclick={() => onCmd(c.id, "1")}>{c.label || "Press"}</button>

      {:else if c.type === "switch"}
        {@const on = v === "1" || v === "true"}
        <button class="sw" class:on role="switch" aria-checked={on}
                aria-label={c.label || c.id} onclick={() => onCmd(c.id, on ? "0" : "1")}>
          <span class="knob"></span>
        </button>

      {:else if c.type === "slider"}
        {@const n = num(v, num(c.min, 0))}
        <div class="sl-top tnum">
          <span>{num(c.min, 0)}</span>
          <strong>{n}{c.unit ? ` ${c.unit}` : ""}</strong>
          <span>{num(c.max, 100)}</span>
        </div>
        <input class="sl" type="range" aria-label={c.label || c.id}
               min={num(c.min, 0)} max={num(c.max, 100)} step={num(c.step, 1) || 1} value={n}
               oninput={(e) => onCmd(c.id, e.currentTarget.value)}/>

      {:else if c.type === "gauge"}
        {@const n = num(v)}
        <div class="gauge" role="img" aria-label="{c.label}: {n}{c.unit || ''}">
          <svg viewBox="-6 -6 112 62" preserveAspectRatio="xMidYMax meet">
            <path d="M8,48 A40,40 0 0 1 88,48" fill="none" stroke="var(--color-line)" stroke-width="8" stroke-linecap="round"/>
            <path d="M8,48 A40,40 0 0 1 88,48" fill="none" stroke="var(--color-brand)" stroke-width="8" stroke-linecap="round"
                  stroke-dasharray="{frac(v, c) * 125.6} 999" style="transition:stroke-dasharray .4s ease"/>
          </svg>
          <span class="gauge-v tnum">{n.toFixed(1)}{c.unit || ""}</span>
        </div>

      {:else if c.type === "donut"}
        {@const p = frac(v, c) * 100}
        <div class="donut" role="img" aria-label="{c.label}: {Math.round(p)} percent">
          <svg viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-line)" stroke-width="3.2"/>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-brand)" stroke-width="3.2"
                    stroke-linecap="round" stroke-dasharray="{p} 100" transform="rotate(-90 18 18)"
                    style="transition:stroke-dasharray .4s ease"/>
          </svg>
          <span class="donut-v tnum">{Math.round(p)}%</span>
        </div>

      {:else if c.type === "progress"}
        {@const p = frac(v, c) * 100}
        <div class="bar" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin="0" aria-valuemax="100">
          <span style:width="{p}%"></span>
        </div>
        <div class="bar-t tnum"><span>{num(v)}{c.unit ? ` ${c.unit}` : ""}</span><span>{p.toFixed(0)}%</span></div>

      {:else if c.type === "status"}
        <StatusDot state={statusKind(v)} text={v || "—"}/>

      {:else if c.type === "color"}
        <div class="colr">
          <input type="color" aria-label={c.label || c.id} value={/^#[0-9a-f]{6}$/i.test(v) ? v : "#0fd08c"}
                 oninput={(e) => onCmd(c.id, e.currentTarget.value)}/>
          <code>{v || "—"}</code>
        </div>

      {:else if c.type === "input"}
        <input class="txt" type="text" aria-label={c.label || c.id}
               placeholder={c.unit || "type and press enter"} value={v}
               onchange={(e) => onCmd(c.id, e.currentTarget.value)}/>

      {:else if c.type === "joystick"}
        <div class="joy" use:joystick={c.id} role="application" aria-label="{c.label}: drag to steer">
          <span class="ring"></span><span class="nub"></span>
        </div>

      {:else if c.type === "image"}
        <img class="img" alt={c.label || ""}
             src={/^(https?:|data:)/.test(String(v)) ? v : `data:image/png;base64,${v}`}/>

      {:else if c.type === "chart"}
        {@const ch = chartOf(v)}
        <svg class="chart" viewBox="0 0 {CW} {CH}" preserveAspectRatio="none" role="img"
             aria-label="{c.label || c.id}{c.unit ? ` (${c.unit})` : ''}: line chart">
          <path class="cg" d={CGRID}/>
          {#if ch}
            <path class="ca" d={ch.area}/>
            <path class="cl" d={ch.line}/>
            <path class="cd" d={ch.dot}/>
          {/if}
        </svg>

      {:else if c.type === "custom"}
        <!-- The firmware owns this markup (setCustomHtml). It is device-supplied,
             not user-supplied, and rendering it verbatim is the documented point
             of the Custom widget — but it does mean a sketch that interpolates
             untrusted input into the snippet is injecting into this page.
             The value goes in via an action, not a {@const} side effect: a
             {@const} is evaluated once when the block is created, so the
             injected value never updated after the first frame. -->
        <div use:customOut={{ id: c.id, value: v }}>{@html c.custom || ""}</div>

      {:else if WIDGETS[c.type]}
        <!-- Everything added after the original sixteen lives in
             shared/widgets/ and is dispatched by type key. Keeping the classic
             types inline above avoids churning the shell for no gain. -->
        {@const Widget = WIDGETS[c.type]}
        <Widget card={c} value={v} cmd={(x) => onCmd(c.id, x)} />

      {:else}
        <!-- A card whose type this UI does not know. Firmware newer than the
             embedded page is a normal state during a staged rollout, so say so
             instead of rendering an empty box the operator can't interpret. -->
        <p class="unknown">Unsupported widget <code>{c.type}</code> — update the device UI.</p>
      {/if}
    </Card>
    {/if}
  {:else}
    <p class="empty">No widgets on this tab.</p>
  {/each}
</main>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast" data-l={t.level}><i aria-hidden="true"></i><span>{t.msg}</span></div>
  {/each}
</div>

<!-- One gradient shared by every chart card. Sparkline.svelte has to mint a
     per-instance id because its colour is a prop; here every chart fills with
     the brand colour, so a second copy would be identical. stop-color takes
     the var() straight, which is what keeps the fill honest across a theme
     toggle. -->
<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <linearGradient id="chart-fade" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="var(--color-brand)" stop-opacity=".3"/>
    <stop offset="1" stop-color="var(--color-brand)" stop-opacity="0"/>
  </linearGradient>
</svg>

<style>
.skip { position:absolute; left:-9999px; top:0; z-index:100; padding:10px 14px;
        background:var(--color-panel); color:var(--color-ink); border-radius:var(--radius-ctl); }
.skip:focus { left:12px; top:12px; }

.wrap { max-width: 1200px; margin: 0 auto; padding: 0 16px; }

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
.pill[data-tone="ok"] { color: var(--color-ok); }

.icon-btn { display: grid; place-items: center; width: 32px; height: 32px; flex: none;
            border: 0; background: none; color: var(--color-muted); cursor: pointer; border-radius: 8px; }
.icon-btn:hover { color: var(--color-ink); background: var(--color-bg-soft); }

.tabs { display: flex; gap: 4px; padding-bottom: 8px; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tab { padding: 5px 13px; border-radius: 99px; white-space: nowrap; cursor: pointer;
       font: inherit; font-size: 13px; font-weight: 600; color: var(--color-muted);
       background: none; border: 1px solid transparent; }
.tab:hover { color: var(--color-ink); }
.tab.on { color: var(--color-brand); border-color: var(--color-brand);
          background: color-mix(in srgb, var(--color-brand) 9%, transparent); }

.scrim { position: fixed; inset: 0; z-index: 60; background: rgb(0 0 0 / .5);
         opacity: 0; pointer-events: none; transition: opacity .2s; }
.scrim.on { opacity: 1; pointer-events: auto; }
.drawer { position: fixed; inset: 0 0 0 auto; z-index: 70; width: min(78vw, 300px);
          display: flex; flex-direction: column; background: var(--color-bg);
          border-left: 1px solid var(--color-line); transform: translateX(100%);
          transition: transform .24s cubic-bezier(.3,.8,.2,1); }
.drawer.on { transform: none; }
.drawer-hd { display: flex; align-items: center; justify-content: space-between;
             height: 60px; padding: 0 12px 0 18px; border-bottom: 1px solid var(--color-line);
             font-weight: 650; font-size: 14px; }
.drawer nav { overflow-y: auto; padding: 6px 0; }
.drawer-item { display: block; width: 100%; text-align: left; padding: 12px 18px;
               font: inherit; font-size: 14.5px; font-weight: 600; cursor: pointer;
               color: var(--color-ink-2); background: none; border: 0;
               border-left: 3px solid transparent; }
.drawer-item.on { color: var(--color-brand); border-left-color: var(--color-brand);
                  background: color-mix(in srgb, var(--color-brand) 8%, transparent); }

.grid { display: grid; grid-template-columns: repeat(12, minmax(0,1fr));
        gap: 12px; padding-top: 16px; padding-bottom: 48px; }
.bare { min-width: 0; }
.unknown { margin: auto 0 0; font-size: 12.5px; color: var(--color-muted); }
.unknown code { font-family: var(--font-mono); color: var(--color-warn); }
.empty { grid-column: span 12; color: var(--color-muted); font-size: 14px; padding: 24px 4px; }

.kpi { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px;
       margin-top: auto; min-width: 0; }
/* The number wins any space fight with its sparkline — a truncated reading
   ("0.60…") is useless, a missing trend line is merely a shame. */
.kpi-v { flex: 1 1 auto; min-width: 0;
         font-size: clamp(20px, 4.2vw, 28px); font-weight: 400; letter-spacing: -.02em;
         line-height: 1.05; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpi-v em { font-style: normal; font-size: .46em; color: var(--color-muted);
            margin-left: .3em; font-weight: 500; }
.kpi-spark { flex: 0 1 52px; min-width: 0; opacity: .85; }
@container (max-width: 150px) { .kpi-spark { display: none; } }

.w-btn { margin-top: auto; padding: 9px 14px; cursor: pointer; font: inherit;
         font-size: 13.5px; font-weight: 600; color: #fff;
         background: var(--tone, var(--color-brand));
         border: 1px solid var(--tone, var(--color-brand));
         border-radius: var(--radius-ctl); }
.w-btn:hover { filter: brightness(1.07); }
.w-btn:active { filter: brightness(.94); }
.w-btn[data-tone="danger"]  { --tone: var(--color-err); }
.w-btn[data-tone="warning"] { --tone: var(--color-warn); }
.w-btn[data-tone="success"] { --tone: var(--color-ok); }
.w-btn[data-tone="info"]    { --tone: var(--color-info); }

.sw { position: relative; width: 46px; height: 26px; margin-top: auto; flex: none;
      border-radius: 99px; cursor: pointer; border: 1px solid var(--color-line);
      background: var(--color-bg-soft); transition: background .18s, border-color .18s; }
.sw.on { background: var(--color-brand); border-color: var(--color-brand); }
.knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%;
        background: var(--color-panel); box-shadow: 0 1px 3px rgb(0 0 0 / .3);
        transition: transform .18s cubic-bezier(.3,.8,.2,1); }
.sw.on .knob { transform: translateX(20px); background: #fff; }

.sl-top { display: flex; align-items: baseline; justify-content: space-between;
          font-size: 11.5px; color: var(--color-muted); }
.sl-top strong { font-size: 14px; font-weight: 650; color: var(--color-brand); }
.sl { width: 100%; height: 22px; appearance: none; -webkit-appearance: none;
      background: none; cursor: pointer; }
.sl::-webkit-slider-runnable-track { height: 5px; border-radius: 5px; background: var(--color-line); }
.sl::-webkit-slider-thumb { -webkit-appearance: none; width: 17px; height: 17px; margin-top: -6px;
      border-radius: 50%; background: var(--color-brand); border: 2px solid var(--color-panel);
      box-shadow: 0 1px 3px rgb(0 0 0 / .25); }
.sl::-moz-range-track { height: 5px; border-radius: 5px; background: var(--color-line); }
.sl::-moz-range-thumb { width: 17px; height: 17px; border-radius: 50%;
      background: var(--color-brand); border: 2px solid var(--color-panel); }

/* The readout sits BELOW the arc, not inside it. Centred in the arc it
   collided with the 8px stroke on any card narrower than ~200px. */
.gauge { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: auto; }
.gauge svg { width: 100%; max-width: 190px; height: 74px; display: block; }
.gauge-v { font-family: var(--font-mono); font-size: 16px; font-weight: 650;
           line-height: 1; color: var(--color-ink); }
.donut { position: relative; display: grid; place-items: center; }
.donut svg { width: 112px; height: 112px; }
.donut-v { position: absolute; font-family: var(--font-mono); font-size: 20px;
           font-weight: 650; color: var(--color-brand); }

.bar { height: 9px; margin-top: auto; border-radius: 99px; overflow: hidden;
       background: var(--color-bg-soft); border: 1px solid var(--color-line-soft); }
.bar span { display: block; height: 100%; background: var(--color-brand);
            transition: width .4s ease; }
.bar-t { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--color-muted); }

.colr { display: flex; align-items: center; gap: 10px; margin-top: auto; }
.colr input { width: 46px; height: 34px; padding: 0; border: 1px solid var(--color-line);
              border-radius: var(--radius-ctl); background: none; cursor: pointer; }
.colr code { font-family: var(--font-mono); font-size: 13px; color: var(--color-ink-2); }

.txt { margin-top: auto; width: 100%; padding: 8px 11px; font: inherit; font-size: 13.5px;
       color: var(--color-ink); background: var(--color-panel-2);
       border: 1px solid var(--color-line); border-radius: var(--radius-ctl); }

.joy { position: relative; width: 132px; height: 132px; margin: 0 auto; border-radius: 50%;
       touch-action: none; cursor: grab; background: var(--color-bg-soft);
       border: 1px solid var(--color-line); }
.joy .ring { position: absolute; inset: 13px; border-radius: 50%;
             border: 1px dashed var(--color-line); }
.nub { position: absolute; left: 44px; top: 44px; width: 44px; height: 44px; border-radius: 50%;
       background: var(--color-brand); box-shadow: 0 2px 8px rgb(0 0 0 / .25);
       transition: transform .07s linear; }

.img { max-width: 100%; height: auto; border-radius: var(--radius-ctl); }
.chart { display: block; width: 100%; height: 170px; }
/* non-scaling-stroke so preserveAspectRatio="none" stretches the geometry but
   not the line weight — same trick as shared/components/Sparkline.svelte. */
.chart path { vector-effect: non-scaling-stroke; }
.cg { fill: none; stroke: var(--color-line); }
.ca { fill: url(#chart-fade); }
.cl { fill: none; stroke: var(--color-brand); stroke-width: 2;
      stroke-linejoin: round; stroke-linecap: round; }
.cd { stroke: var(--color-brand); stroke-width: 6.4; stroke-linecap: round; }

.toasts { position: fixed; right: 12px; bottom: 12px; z-index: 80;
          display: flex; flex-direction: column; gap: 8px; max-width: min(360px, calc(100vw - 24px)); }
.toast { display: flex; align-items: center; gap: 10px; padding: 10px 13px; font-size: 13px;
         /* Opaque: this used to reference an undefined --color-panel-solid and
            rendered as transparent text floating over the dashboard. */
         background: var(--color-panel); color: var(--color-ink);
         border: 1px solid var(--color-line); border-left-width: 3px;
         border-radius: var(--radius-ctl); box-shadow: var(--shadow-pop); }
.toast i { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--color-info); }
.toast[data-l="success"] { border-left-color: var(--color-ok); }
.toast[data-l="success"] i { background: var(--color-ok); }
.toast[data-l="warn"] { border-left-color: var(--color-warn); }
.toast[data-l="warn"] i { background: var(--color-warn); }
.toast[data-l="error"] { border-left-color: var(--color-err); }
.toast[data-l="error"] i { background: var(--color-err); }
.toast[data-l="info"] { border-left-color: var(--color-info); }
</style>
