<!-- ---------------------------------------------------------------------------
  JouleDash — real-time dashboard SPA. Svelte 5 + Tailwind v4 + bits-ui.
  Design ported from Google Stitch generated screens (Dec 2026):
  https://stitch.googleapis.com/projects/16086657541908603661
  Author: Chinmoy Bhuyan <dikibhuyan@gmail.com>  (c) 2026 — MIT
--------------------------------------------------------------------------- -->
<script>
  import { onMount, onDestroy } from "svelte";
  import Card from "$shared/components/Card.svelte";
  import Value from "$shared/components/Value.svelte";
  import StatusDot from "$shared/components/StatusDot.svelte";
  import Sparkline from "$shared/components/Sparkline.svelte";
  import { Zap, BatteryCharging, IndianRupee, Clock, ActivitySquare,
           Cpu, Wifi, Bolt, Gauge as GaugeIcon, Thermometer, Droplets,
           Sun, Moon, Monitor } from "lucide-svelte";

  let ws        = $state(null);
  let layout    = $state(null);
  let values    = $state({});
  let history   = $state({});            // id → number[] (sparkline buffers)
  let currentTab= $state(null);
  let connected = $state(false);
  let toasts    = $state([]);
  let theme     = $state(localStorage.getItem("joule-theme") || "dark");
  // Viewport bucket — recomputed on resize so the grid can collapse from
  // 12 columns (desktop) → cards in pairs (tablet/mobile) without each
  // card having to know about media queries.
  let viewport  = $state("desktop");

  $effect(() => { document.documentElement.setAttribute("data-theme", theme); });
  function cycleTheme() {
    theme = theme === "dark" ? "light" : theme === "light" ? "auto" : "dark";
    localStorage.setItem("joule-theme", theme);
  }

  function open() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(proto + "//" + location.host + "/dash/ws");
    ws.onopen  = () => connected = true;
    ws.onclose = () => { connected = false; setTimeout(open, 1500); };
    ws.onerror = () => connected = false;
    ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch {} };
  }
  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  function handle(m) {
    if (m.type === "layout") {
      layout = m;
      if (m.title) document.title = m.title;
      if (m.brand) {
        document.documentElement.style.setProperty("--color-brand", m.brand);
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", m.brand);
      }
      if (!currentTab || !(m.tabs || []).includes(currentTab)) {
        const hash = (location.hash || "").replace(/^#/, "").toLowerCase();
        const match = (m.tabs || []).find(t => t.toLowerCase().includes(hash));
        currentTab = match || (m.tabs && m.tabs[0]) || "Main";
      }
    } else if (m.type === "upd") {
      for (const c of m.cards) {
        values[c.id] = c.value;
        const n = parseFloat(c.value);
        if (!isNaN(n)) history[c.id] = [...(history[c.id] || []), n].slice(-32);
      }
    } else if (m.type === "notify") {
      const t = { id: crypto.randomUUID(), level: m.level || "info", msg: m.message, ttl: m.ttl || 4500 };
      toasts = [...toasts, t];
      setTimeout(() => toasts = toasts.filter(x => x.id !== t.id), t.ttl);
    }
  }

  onMount(() => {
    open();
    const updateVp = () => {
      const w = window.innerWidth;
      viewport = w <= 420 ? "small" : w <= 760 ? "tablet" : "desktop";
    };
    updateVp();
    window.addEventListener("resize", updateVp);
    return () => window.removeEventListener("resize", updateVp);
  });
  onDestroy(() => ws?.close());

  let visibleCards = $derived(
    layout?.cards?.filter(c => !c.hidden && (c.tab || "Main") === currentTab) || []
  );

  // Map declared card width → an effective grid span for the active
  // viewport. On a phone, even a "narrow" 3-col card becomes half-row so
  // the value + unit + sparkline have room; full-width charts stay full.
  function spanFor(c) {
    const base = c.width || (c.type === "chart" || c.type === "custom" ? 12 : 3);
    if (viewport === "small") {
      if (c.type === "chart" || c.type === "custom" || base >= 12) return 12;
      return 6;     // pairs of cards on phones
    }
    if (viewport === "tablet") return Math.min(12, base * 2);
    return base;
  }

  function onCmd(id, v) { send({ type: "cmd", id, value: String(v) }); }

  // ---- chart canvas ----
  function drawChart(canvas, raw) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight || 180;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    let xs = [], ys = [];
    try { const j = typeof raw === "string" ? JSON.parse(raw) : raw; xs = j.x || []; ys = j.y || []; } catch { return; }
    if (!ys.length) return;
    const mn = Math.min(...ys), mx = Math.max(...ys), rg = (mx - mn) || 1;
    const css = getComputedStyle(document.documentElement);
    const b  = css.getPropertyValue("--color-brand").trim()   || "#6366f1";
    const b2 = css.getPropertyValue("--color-brand-2").trim() || "#8b5cf6";
    ctx.strokeStyle = css.getPropertyValue("--color-line").trim() || "rgba(255,255,255,.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const y = (i + 1) * (h - 16) / 5 + 8; ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(w - 4, y); ctx.stroke(); }
    const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, b); g.addColorStop(1, b2);
    const pts = ys.map((y, i) => [4 + (i / (ys.length - 1 || 1)) * (w - 8), h - 8 - ((y - mn) / rg) * (h - 24)]);
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p[0], p[1]));
    ctx.lineTo(w - 4, h - 4); ctx.lineTo(4, h - 4); ctx.closePath();
    const ag = ctx.createLinearGradient(0, 0, 0, h); ag.addColorStop(0, b + "55"); ag.addColorStop(1, b + "00");
    ctx.fillStyle = ag; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p[0], p[1]));
    ctx.strokeStyle = g; ctx.lineWidth = 2.4; ctx.lineJoin = "round"; ctx.stroke();
    const lp = pts[pts.length - 1];
    ctx.fillStyle = b; ctx.beginPath(); ctx.arc(lp[0], lp[1], 4, 0, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(lp[0], lp[1], 1.6, 0, 7); ctx.fill();
  }
  function chartCanvas(node, val) { drawChart(node, val); return { update(v) { drawChart(node, v); } }; }

  function joystickHandler(el, id) {
    let dragging = false;
    const nub = el.querySelector(".nub");
    const move = (cx, cy) => {
      const b = el.getBoundingClientRect();
      const dx = (cx - b.left - b.width / 2) / (b.width / 2);
      const dy = (cy - b.top  - b.height / 2) / (b.height / 2);
      const md = Math.min(1, Math.hypot(dx, dy));
      const ag = Math.atan2(dy, dx);
      const x = Math.cos(ag) * md, y = Math.sin(ag) * md;
      nub.style.transform = `translate(${x * 48}px, ${y * 48}px)`;
      onCmd(id, `${Math.round(x * 100)},${-Math.round(y * 100)}`);
    };
    el.onpointerdown = (e) => { dragging = true; el.setPointerCapture(e.pointerId); move(e.clientX, e.clientY); };
    el.onpointermove = (e) => { if (dragging) move(e.clientX, e.clientY); };
    el.onpointerup   = ()  => { dragging = false; nub.style.transform = "translate(0,0)"; onCmd(id, "0,0"); };
  }

  function statusKind(v) {
    const lv = String(v || "").toLowerCase();
    if (/^(ok|online|connect|valid|success|live)/.test(lv)) return "ok";
    if (/warn/.test(lv))                                     return "warn";
    if (/err|off|fail|invalid/.test(lv))                     return "err";
    return "muted";
  }

  // Map common card IDs to a semantic colour + Lucide icon so KPIs feel
  // intentional rather than generic. Falls back to defaults when no match.
  function decor(c) {
    const idl = (c.id || "").toLowerCase();
    if (/pwr|power|kw/.test(idl)) return { color: "info",     Icon: Zap };
    if (/kwh|energy/.test(idl))   return { color: "success",  Icon: BatteryCharging };
    if (/cost/.test(idl))         return { color: "primary",  Icon: IndianRupee };
    if (/sess|time|up/.test(idl)) return { color: c.color||"default", Icon: Clock };
    if (/temp|tmp/.test(idl))     return { color: "warning",  Icon: Thermometer };
    if (/hum/.test(idl))          return { color: "info",     Icon: Droplets };
    if (/rssi|net/.test(idl))     return { color: c.color||"default", Icon: Wifi };
    if (/heap/.test(idl))         return { color: c.color||"default", Icon: Cpu };
    if (/volt|v\d/.test(idl))     return { color: "info",     Icon: Zap };
    if (/cur|amp|i\d/.test(idl))  return { color: "warning",  Icon: Bolt };
    if (/freq/.test(idl))         return { color: c.color||"default", Icon: ActivitySquare };
    if (/cpu|load/.test(idl))     return { color: c.color||"default", Icon: GaugeIcon };
    return { color: c.color || "default", Icon: null };
  }
</script>

<!-- ============================== HEADER ============================== -->
<header class="sticky top-0 z-50 backdrop-blur-xl border-b border-[color:var(--color-line)]"
        style="background:color-mix(in srgb,var(--color-bg) 80%,transparent)">
  <div class="max-w-[1280px] mx-auto px-6 h-16 flex items-center gap-3">
    <div class="w-8 h-8 grid place-items-center rounded-[10px] text-white font-extrabold text-[14px]"
         style="background:var(--grad);box-shadow:0 6px 20px -4px color-mix(in srgb,var(--color-brand) 60%,transparent),inset 0 1px 0 rgb(255 255 255/.25)">⚡</div>
    <div class="flex flex-col min-w-0">
      <div class="flex items-center gap-2">
        <h1 class="font-semibold text-[15px] tracking-tight text-[color:var(--color-ink)] truncate">{layout?.title || "JouleDash"}</h1>
        <span class="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[10px]
                     bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] border border-[color:var(--color-line)]"
              style:color={connected ? "var(--color-ok)" : "var(--color-muted)"}>
          <span class="w-[6px] h-[6px] rounded-full"
                style:background={connected ? "var(--color-ok)" : "var(--color-muted)"}
                style:box-shadow={connected ? "0 0 0 4px color-mix(in srgb,var(--color-ok) 18%,transparent)" : "none"}
                class:animate-[pulse_2.4s_ease-in-out_infinite]={connected}></span>
          {connected ? "Online" : "Offline"}
        </span>
      </div>
      <span class="text-[11.5px] text-[color:var(--color-muted)] font-medium">live dashboard</span>
    </div>
    <div class="flex-1"></div>
    <button onclick={cycleTheme} aria-label="theme"
      class="w-8 h-8 grid place-items-center rounded-full text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,transparent)] transition-colors cursor-pointer">
      {#if theme === "light"}<Sun size={16} strokeWidth={2.2}/>{:else if theme === "dark"}<Moon size={16} strokeWidth={2.2}/>{:else}<Monitor size={16} strokeWidth={2.2}/>{/if}
    </button>
  </div>
</header>

<!-- ============================== TAB BAR ============================== -->
{#if layout?.tabs?.length}
  <nav class="sticky top-16 z-40 backdrop-blur-xl border-b border-[color:var(--color-line)]"
       style="background:color-mix(in srgb,var(--color-bg) 80%,transparent)">
    <div class="max-w-[1280px] mx-auto px-6 py-3 flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden" style="scrollbar-width:none">
      {#each layout.tabs as t (t)}
        <button onclick={() => { currentTab = t; history.replaceState(null, "", "#" + t.toLowerCase()); }}
          class="px-4 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all border cursor-pointer"
          class:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]={t === currentTab}
          class:border-[color:var(--color-line)]={t === currentTab}
          class:text-[color:var(--color-ink)]={t === currentTab}
          class:border-transparent={t !== currentTab}
          class:text-[color:var(--color-muted)]={t !== currentTab}>
          {t}
        </button>
      {/each}
    </div>
  </nav>
{/if}

<!-- ============================== GRID =============================== -->
<main class="relative z-10 max-w-[1280px] mx-auto p-5">
  <!-- SVG defs for brand-gradient strokes used by gauges/donuts. -->
  <svg aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0">
    <defs><linearGradient id="brand-gradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="var(--color-brand)"/>
      <stop offset="100%" stop-color="var(--color-brand-2)"/>
    </linearGradient></defs>
  </svg>

  <div class="grid gap-3.5" style="grid-template-columns:repeat(12,minmax(0,1fr))">
    {#each visibleCards as c (c.id)}
      {@const v = values[c.id] ?? c.value ?? ""}
      {@const dec = decor(c)}
      <Card color={c.color || dec.color} Icon={dec.Icon}
            span={spanFor(c)}
            label={c.label || c.id}>

        <!-- ===== Numeric ===== -->
        {#if c.type === "number" || c.type === "temperature" || c.type === "humidity"}
          <div class="flex items-end justify-between gap-2 mt-auto min-w-0">
            <div class="font-mono font-light tabular-nums truncate min-w-0"
                 style="font-size:clamp(20px, 4.4vw, 28px);letter-spacing:-.5px;line-height:1.05">
              {v || "—"}{#if c.unit}<span class="text-[13px] text-[color:var(--color-muted)] ml-1">{c.unit}</span>{/if}
            </div>
            {#if history[c.id]?.length > 1}
              <div class="w-14 h-8 flex-shrink-0 opacity-90 hidden sm:block">
                <Sparkline data={history[c.id]} height={32}/>
              </div>
            {/if}
          </div>

        <!-- ===== Button ===== -->
        {:else if c.type === "button"}
          <button onclick={() => onCmd(c.id, "1")}
            class="px-4 py-2.5 rounded-xl text-white font-semibold text-[13.5px] cursor-pointer transition-all hover:-translate-y-0.5 active:translate-y-0 mt-auto"
            style="background:var(--grad);box-shadow:0 8px 24px -8px color-mix(in srgb,var(--color-brand) 70%,transparent),inset 0 1px 0 rgb(255 255 255/.2)">
            {c.label || "Press"}
          </button>

        <!-- ===== Switch ===== -->
        {:else if c.type === "switch"}
          {@const on = v === "1" || v === 1 || v === true}
          <button aria-label="{c.label || c.id} toggle" onclick={() => onCmd(c.id, on ? "0" : "1")}
            class="relative w-12 h-7 rounded-full transition-all cursor-pointer mt-auto"
            style:background={on ? "var(--grad)" : "color-mix(in srgb, var(--color-ink) 12%, transparent)"}
            style:box-shadow={on ? "0 4px 14px -4px color-mix(in srgb, var(--color-brand) 70%, transparent)" : "none"}>
            <span class="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-md transition-all"
                  style:left={on ? "23px" : "3px"}></span>
          </button>

        <!-- ===== Slider ===== -->
        {:else if c.type === "slider"}
          {@const num = parseFloat(v) || c.min || 0}
          <div class="flex items-center justify-between text-[11px] text-[color:var(--color-muted)] font-mono">
            <span>{c.min ?? 0}</span>
            <span class="font-semibold text-[color:var(--color-brand)] text-[13px] tabular-nums">{num}{c.unit ? " "+c.unit : ""}</span>
            <span>{c.max ?? 100}</span>
          </div>
          <input type="range" min={c.min ?? 0} max={c.max ?? 100} step={c.step || 1} value={num}
                 oninput={(e) => onCmd(c.id, e.currentTarget.value)} class="joule-range w-full"/>

        <!-- ===== Gauge ===== -->
        {:else if c.type === "gauge"}
          {@const n = parseFloat(v) || 0}
          {@const lo = c.min ?? 0}
          {@const hi = c.max ?? 100}
          {@const p  = Math.max(0, Math.min(1, (n - lo) / (hi - lo)))}
          {@const len = p * 125.6}
          <div class="relative" style="height:96px">
            <!-- viewBox includes 5-unit margin so the 8-unit stroke can't
                 clip the right/top edge when the card is very narrow. -->
            <svg viewBox="-5 -5 110 70" preserveAspectRatio="xMidYMax meet" class="w-full h-full">
              <path d="M10,50 A40,40 0 0 1 90,50" fill="none" stroke="var(--color-line)" stroke-width="8" stroke-linecap="round"/>
              <path d="M10,50 A40,40 0 0 1 90,50" fill="none" stroke="url(#brand-gradient)" stroke-width="8" stroke-linecap="round"
                    stroke-dasharray="{len} 999" style="transition:stroke-dasharray .5s ease"/>
            </svg>
            <div class="absolute inset-x-0 bottom-0 text-center font-mono font-bold text-[18px] text-[color:var(--color-ink)]">{n.toFixed(1)}{c.unit || ""}</div>
          </div>

        <!-- ===== Donut ===== -->
        {:else if c.type === "donut"}
          {@const n = parseFloat(v) || 0}
          {@const lo = c.min ?? 0}
          {@const hi = c.max ?? 100}
          {@const p  = Math.max(0, Math.min(100, ((n - lo) / (hi - lo)) * 100))}
          <div class="relative grid place-items-center" style="height:140px">
            <svg viewBox="0 0 36 36" class="w-[120px] h-[120px]">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-line)" stroke-width="3"/>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="url(#brand-gradient)" stroke-width="3"
                      stroke-linecap="round" stroke-dasharray="{p} 100" transform="rotate(-90 18 18)"
                      style="transition:stroke-dasharray .5s ease"/>
            </svg>
            <div class="absolute font-mono font-extrabold text-[22px]" style="background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">{Math.round(p)}%</div>
          </div>

        <!-- ===== Progress ===== -->
        {:else if c.type === "progress"}
          {@const n = parseFloat(v) || 0}
          {@const lo = c.min ?? 0}
          {@const hi = c.max ?? 100}
          {@const p = Math.max(0, Math.min(100, ((n - lo) / (hi - lo)) * 100))}
          <div class="h-3 rounded-full overflow-hidden mt-auto" style="background:color-mix(in srgb,var(--color-ink) 10%,transparent)">
            <div class="h-full rounded-full transition-[width] duration-500"
                 style:width="{p}%" style:background="var(--grad)"
                 style:box-shadow="0 0 16px color-mix(in srgb, var(--color-brand) 50%, transparent)"></div>
          </div>
          <div class="flex items-center justify-between text-[11px] text-[color:var(--color-muted)] font-mono">
            <span>{n}{c.unit ? " "+c.unit : ""}</span><span>{p.toFixed(1)}%</span>
          </div>

        <!-- ===== Status ===== -->
        {:else if c.type === "status"}
          <StatusDot state={statusKind(v)} text={v || "—"}/>

        <!-- ===== Color ===== -->
        {:else if c.type === "color"}
          <div class="flex items-center gap-3 mt-auto">
            <input type="color" value={v || "#6366f1"}
                   oninput={(e) => onCmd(c.id, e.currentTarget.value)}
                   class="w-14 h-10 rounded-xl border-0 cursor-pointer overflow-hidden"/>
            <span class="font-mono text-[14px] text-[color:var(--color-ink-2)]">{v || "#6366f1"}</span>
          </div>

        <!-- ===== Input ===== -->
        {:else if c.type === "input"}
          <input type="text" placeholder={c.unit || "type and press enter"}
                 value={v} onchange={(e) => onCmd(c.id, e.currentTarget.value)}
                 class="w-full px-3 py-2.5 rounded-xl border border-[color:var(--color-line)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] text-[color:var(--color-ink)] outline-none transition-all focus:border-[color:var(--color-brand)] focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand)_22%,transparent)] mt-auto"/>

        <!-- ===== Joystick ===== -->
        {:else if c.type === "joystick"}
          <div class="relative w-[140px] h-[140px] mx-auto rounded-full cursor-pointer border border-[color:var(--color-line)] [touch-action:none]"
               style="background:radial-gradient(circle at 30% 30%,color-mix(in srgb,var(--color-brand) 14%,var(--color-panel)),var(--color-panel))"
               use:joystickHandler={c.id}>
            <div class="absolute inset-[14px] rounded-full border border-dashed border-[color:var(--color-line)] opacity-60"></div>
            <div class="nub absolute w-11 h-11 rounded-full"
                 style="left:48px;top:48px;background:var(--grad);box-shadow:0 6px 16px color-mix(in srgb,var(--color-brand) 35%,transparent),inset 0 2px 4px rgb(255 255 255/.3);transition:transform .08s linear"></div>
          </div>

        <!-- ===== Image ===== -->
        {:else if c.type === "image"}
          <img src={v?.startsWith("http") || v?.startsWith("data:") ? v : ("data:image/png;base64," + v)} alt="" class="max-w-full rounded-xl"/>

        <!-- ===== Chart ===== -->
        {:else if c.type === "chart"}
          <div class="w-full" style="height:180px">
            <canvas use:chartCanvas={v} class="block w-full h-full"></canvas>
          </div>

        <!-- ===== Custom HTML ===== -->
        {:else if c.type === "custom"}
          {@html c.custom || ""}
          {@const _injected = (() => {
            queueMicrotask(() => {
              const el = document.getElementById("dash-" + c.id + "-out");
              if (el && el.textContent !== String(v)) el.textContent = String(v);
            });
            return null;
          })()}
        {/if}
      </Card>
    {/each}
  </div>
</main>

<!-- ============================== TOASTS ============================== -->
<div class="fixed right-3.5 bottom-3.5 flex flex-col gap-2 z-50 pointer-events-none max-w-[min(360px,90vw)]">
  {#each toasts as t (t.id)}
    <div class="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-[13px] pointer-events-auto border bg-[color:var(--color-panel-solid)]"
         style:box-shadow="var(--shadow-card)"
         style:border-color={t.level === "success" ? "var(--color-ok)" : t.level === "warn" ? "var(--color-warn)" : t.level === "error" ? "var(--color-err)" : "var(--color-info)"}>
      <span class="w-1.5 h-8 rounded-[3px]"
            style:background={t.level === "success" ? "var(--color-ok)" : t.level === "warn" ? "var(--color-warn)" : t.level === "error" ? "var(--color-err)" : "var(--color-info)"}></span>
      <span>{t.msg}</span>
    </div>
  {/each}
</div>

<style>
  :global(.joule-range) { -webkit-appearance: none; appearance: none; background: transparent; height: 24px; outline: none; }
  :global(.joule-range::-webkit-slider-runnable-track) { height: 6px; border-radius: 6px; background: color-mix(in srgb, var(--color-ink) 12%, transparent); }
  :global(.joule-range::-webkit-slider-thumb) { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--grad); margin-top: -7px; cursor: pointer; border: 2px solid #fff; box-shadow: 0 2px 8px color-mix(in srgb, var(--color-brand) 35%, transparent); }
  :global(.joule-range::-moz-range-track) { height: 6px; border-radius: 6px; background: color-mix(in srgb, var(--color-ink) 12%, transparent); }
  :global(.joule-range::-moz-range-thumb) { width: 20px; height: 20px; border-radius: 50%; background: var(--color-brand); border: 2px solid #fff; cursor: pointer; }
  @keyframes pulse {
    0%,100% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-ok) 18%, transparent); }
    50%     { box-shadow: 0 0 0 7px color-mix(in srgb, var(--color-ok)  6%, transparent); }
  }
</style>
