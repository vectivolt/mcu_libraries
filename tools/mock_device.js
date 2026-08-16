// ---------------------------------------------------------------------------
// VectiSuite — mock device server for UI development.
//
// Serves the built single-file UIs from ui/dist and speaks enough of each
// library's wire protocol to drive the pages with plausible live data. This
// exists so the SPAs can be developed, screenshotted and regression-checked
// without flashing an ESP32 and standing next to it.
//
// The WebSocket implementation is hand-rolled (~70 lines) rather than pulling
// in `ws`: the only frames these UIs exchange are short unfragmented text
// frames, so the full protocol is not needed and the repo stays dependency
// free for this tool.
//
//   node tools/mock_device.js            # http://localhost:3137/dash
//
// (c) 2026 VectiVolt — Apache-2.0 License
// ---------------------------------------------------------------------------
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "3137", 10);
const DIST = path.resolve(__dirname, "../ui/dist");
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// ---- minimal WebSocket ------------------------------------------------------

/** Encode one server->client text frame (never masked, per RFC 6455 §5.1). */
function encodeText(str) {
  const payload = Buffer.from(str, "utf8");
  const n = payload.length;
  let header;
  if (n < 126) {
    header = Buffer.from([0x81, n]);
  } else if (n < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(n, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([header, payload]);
}

/** Pull complete client->server text frames out of a rolling buffer. */
function decodeFrames(buf) {
  const out = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const opcode = buf[off] & 0x0f;
    const masked = (buf[off + 1] & 0x80) !== 0;
    let len = buf[off + 1] & 0x7f;
    let p = off + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mask = null;
    if (masked) { if (p + 4 > buf.length) break; mask = buf.slice(p, p + 4); p += 4; }
    if (p + len > buf.length) break;                  // frame still arriving
    const body = buf.slice(p, p + len);
    if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
    if (opcode === 0x1) out.push(body.toString("utf8"));
    if (opcode === 0x8) out.push(null);               // close
    off = p + len;
  }
  return { frames: out, rest: buf.slice(off) };
}

const rooms = new Map();  // path -> Set<socket>

function broadcast(pathname, obj) {
  const frame = encodeText(JSON.stringify(obj));
  for (const s of rooms.get(pathname) || []) {
    if (!s.destroyed) s.write(frame);
  }
}

// ---- fake telemetry ---------------------------------------------------------

const TABS = ["Overview", "Energy", "Controls", "Diagnostics", "Widgets"];
const CARDS = [
  { id: "hero",  type: "custom", label: "Charge point", tab: "Overview", width: 12,
    custom: "<div style='display:flex;align-items:center;gap:14px;flex-wrap:wrap'>" +
            "<div style='font-size:13px;font-weight:600;color:var(--color-brand)'>BAY 3 · CCS2</div>" +
            "<div style='font-size:22px;font-weight:600'><span id='dash-hero-out'>—</span></div></div>" },
  { id: "pwr",   type: "number", label: "Power output",    unit: "kW",  tab: "Overview", width: 3 },
  { id: "kwh",   type: "number", label: "Energy",          unit: "kWh", tab: "Overview", width: 3 },
  { id: "cost",  type: "number", label: "Session cost",    unit: "₹",   tab: "Overview", width: 3 },
  { id: "sess",  type: "number", label: "Session time",    unit: "min", tab: "Overview", width: 3 },
  { id: "st",    type: "status", label: "Charger state",   tab: "Overview", width: 4 },
  { id: "soc",   type: "donut",  label: "Battery SoC",     unit: "%", tab: "Overview", width: 4, min: 0, max: 100 },
  { id: "cg",    type: "gauge",  label: "Charge power",    unit: "kW", tab: "Overview", width: 4, min: 0, max: 22 },

  { id: "v1",    type: "number", label: "Voltage L1",  unit: "V",  tab: "Energy", width: 3 },
  { id: "i1",    type: "number", label: "Current L1",  unit: "A",  tab: "Energy", width: 3 },
  { id: "pf",    type: "number", label: "Power factor", unit: "",  tab: "Energy", width: 3 },
  { id: "f",     type: "number", label: "Frequency",   unit: "Hz", tab: "Energy", width: 3 },
  { id: "q",     type: "progress", label: "Daily quota", unit: "%", tab: "Energy", width: 6, min: 0, max: 100 },
  { id: "gn",    type: "donut",  label: "Renewable mix", unit: "%", tab: "Energy", width: 6, min: 0, max: 100, color: "success" },
  { id: "tr",    type: "chart",  label: "Power over time", tab: "Energy", width: 12 },

  { id: "start", type: "switch", label: "Start session", tab: "Controls", width: 3 },
  { id: "lim",   type: "slider", label: "Current limit", unit: "A", tab: "Controls", width: 6, min: 6, max: 32, step: 1 },
  { id: "led",   type: "color",  label: "LED ring",      tab: "Controls", width: 3 },
  { id: "estop", type: "button", label: "Emergency stop", tab: "Controls", width: 3, color: "danger" },
  { id: "joy",   type: "joystick", label: "Camera pan / tilt", tab: "Controls", width: 6 },
  { id: "tag",   type: "input",  label: "Driver RFID tag", tab: "Controls", width: 3 },

  { id: "tmp",   type: "temperature", label: "PCB temperature", unit: "°C", tab: "Diagnostics", width: 3 },
  { id: "hum",   type: "humidity",    label: "Cabinet humidity", unit: "%", tab: "Diagnostics", width: 3 },
  { id: "rssi",  type: "number", label: "Wi-Fi RSSI", unit: "dBm", tab: "Diagnostics", width: 3 },
  { id: "heap",  type: "number", label: "Free heap",  unit: "KB",  tab: "Diagnostics", width: 3 },
  { id: "net",   type: "status", label: "Network link", tab: "Diagnostics", width: 4 },
  { id: "ocpp",  type: "status", label: "OCPP backend", tab: "Diagnostics", width: 4 },
  { id: "up",    type: "number", label: "Uptime", unit: "s", tab: "Diagnostics", width: 4 },

  // ---- widget showcase tab: every type the registry knows ----
  { id: "h1",   type: "header",  label: "Readouts",            tab: "Widgets", width: 12 },
  { id: "w_txt",  type: "text",     label: "Firmware",     tab: "Widgets", width: 3 },
  { id: "w_bdg",  type: "badge",    label: "Mode",         tab: "Widgets", width: 3, color: "info" },
  { id: "w_led",  type: "led",      label: "Contactor",    tab: "Widgets", width: 3 },
  { id: "w_bat",  type: "battery",  label: "Pack",  unit: "%", tab: "Widgets", width: 3, min: 0, max: 100 },
  { id: "w_sig",  type: "signal",   label: "Wi-Fi", unit: "dBm", tab: "Widgets", width: 3 },
  { id: "w_upt",  type: "uptime",   label: "Uptime",       tab: "Widgets", width: 3 },
  { id: "w_spk",  type: "sparkline",label: "Trend",        tab: "Widgets", width: 3 },
  { id: "w_tbl",  type: "table",    label: "Diagnostics",  tab: "Widgets", width: 6 },
  { id: "w_log",  type: "logview",  label: "Events",       tab: "Widgets", width: 6 },

  { id: "h2",   type: "header",  label: "Meters",              tab: "Widgets", width: 12 },
  { id: "w_dial", type: "dial",    label: "Dial",   unit: "kW", tab: "Widgets", width: 3, min: 0, max: 22 },
  { id: "w_bar",  type: "bar",     label: "Bar",    unit: "%",  tab: "Widgets", width: 3, min: 0, max: 100 },
  { id: "w_lvl",  type: "level",   label: "Tank",   unit: "L",  tab: "Widgets", width: 3, min: 0, max: 60 },
  { id: "w_cmp",  type: "compass", label: "Heading",           tab: "Widgets", width: 3, min: 0, max: 360 },
  { id: "w_thm",  type: "thermo",  label: "Coolant", unit: "C", tab: "Widgets", width: 3, min: -10, max: 90 },

  { id: "h3",   type: "header",  label: "Charts",              tab: "Widgets", width: 12 },
  { id: "w_mc",   type: "multichart", label: "3-phase current", tab: "Widgets", width: 12 },
  { id: "w_hist", type: "histogram",  label: "Hourly kWh",      tab: "Widgets", width: 6 },
  { id: "w_sct",  type: "scatter",    label: "V vs I",          tab: "Widgets", width: 6 },
  { id: "w_heat", type: "heatmap",    label: "Cell temps",      tab: "Widgets", width: 6 },

  { id: "h4",   type: "header",  label: "Controls",            tab: "Widgets", width: 12 },
  { id: "w_cfm",  type: "confirm",  label: "Factory reset", tab: "Widgets", width: 3, color: "danger" },
  { id: "w_mom",  type: "momentary",label: "Jog motor",     tab: "Widgets", width: 3 },
  { id: "w_stp",  type: "stepper",  label: "Setpoint", unit: "A", tab: "Widgets", width: 3, min: 6, max: 32, step: 1 },
  { id: "w_rng",  type: "range",    label: "Window",   unit: "C", tab: "Widgets", width: 3, min: 0, max: 60 },
  { id: "w_drp",  type: "dropdown", label: "Profile",  tab: "Widgets", width: 3, opts: "Eco|Standard|Boost" },
  { id: "w_rad",  type: "radio",    label: "Phase",    tab: "Widgets", width: 3, opts: "L1|L2|L3" },
  { id: "w_chk",  type: "checklist",label: "Enabled",  tab: "Widgets", width: 3, opts: "OCPP|MQTT|Modbus" },
  { id: "w_kno",  type: "knob",     label: "Limit", unit: "A", tab: "Widgets", width: 3, min: 6, max: 32, step: 1 },
  { id: "w_xy",   type: "xypad",    label: "Pan / tilt", tab: "Widgets", width: 3 },
  { id: "w_kpd",  type: "keypad",   label: "PIN",       tab: "Widgets", width: 3 },
  { id: "w_txa",  type: "textarea", label: "Site notes",tab: "Widgets", width: 6 },
  { id: "w_pwd",  type: "password", label: "MQTT pass", tab: "Widgets", width: 3 },
  { id: "w_dt",   type: "datetime", label: "Scheduled", tab: "Widgets", width: 3 },
  { id: "w_qr",   type: "qrcode",   label: "Join this AP", tab: "Widgets", width: 4 },
  { id: "d1",   type: "divider", label: "end of catalogue",    tab: "Widgets", width: 12 },
];

let t = 0;
const series = { x: [], y: [] };
const values = {};

function tickValues() {
  t += 1;
  const p = 7.2 + 0.35 * Math.sin(t / 6);
  values.hero = `Charging · ${p.toFixed(1)} kW`;
  values.pwr  = p.toFixed(2);
  values.kwh  = (t * 0.02).toFixed(2);
  values.cost = (t * 0.02 * 18).toFixed(1);
  values.sess = String(Math.floor(t / 2));
  values.st   = "ok";
  values.soc  = String(Math.min(100, 34 + t * 0.3).toFixed(0));
  values.cg   = p.toFixed(1);
  values.v1   = (232 + Math.sin(t / 3) * 2).toFixed(1);
  values.i1   = (p * 1000 / 232).toFixed(1);
  values.pf   = (0.97 + 0.01 * Math.sin(t / 5)).toFixed(3);
  values.f    = (50 + 0.03 * Math.sin(t / 7)).toFixed(2);
  values.q    = String(Math.min(100, t * 0.8).toFixed(0));
  values.gn   = String((62 + 8 * Math.sin(t / 9)).toFixed(0));
  values.tmp  = (38 + 3 * Math.sin(t / 8)).toFixed(1);
  values.hum  = (44 + 5 * Math.sin(t / 11)).toFixed(0);
  values.rssi = String(Math.round(-58 + 6 * Math.sin(t / 4)));
  values.heap = String(Math.round(182 + 8 * Math.sin(t / 6)));
  values.up   = String(t * 2);
  values.net  = "ok";
  values.ocpp = t % 40 < 32 ? "ok" : "warn";
  if (values.start === undefined) values.start = "1";
  if (values.lim === undefined)   values.lim = "16";
  if (values.led === undefined)   values.led = "#0fd08c";
  if (values.tag === undefined)   values.tag = "";

  series.x.push(t); series.y.push(Number(p.toFixed(3)));
  if (series.x.length > 40) { series.x.shift(); series.y.shift(); }
  values.tr = JSON.stringify(series);

  // showcase values
  values.w_txt = "1.4.2+demo";
  values.w_bdg = "Boost";
  values.w_led = (t % 6 < 3) ? "1" : "0";
  values.w_bat = String(Math.min(100, 34 + t * 0.3).toFixed(0));
  values.w_sig = String(Math.round(-58 + 6 * Math.sin(t / 4)));
  values.w_upt = String(t * 137);
  values.w_spk = JSON.stringify(series.y.slice(-20));
  values.w_tbl = JSON.stringify([["Chip","ESP32-S3"],["Flash","8 MB"],["PSRAM","2 MB"],
                                 ["MAC","D0:CF:13:72:17:58"],["Slot","app0"],["Heap","186 KB"]]);
  values.w_log = JSON.stringify(["session started","meter sync ok","rssi -71 dBm",
                                 "OCPP MeterValues accepted","quota 46%"]);
  values.w_dial = (7 + 2 * Math.sin(t / 5)).toFixed(1);
  values.w_bar  = String(Math.min(100, t * 0.9).toFixed(0));
  values.w_lvl  = (30 + 20 * Math.sin(t / 8)).toFixed(1);
  values.w_cmp  = String(Math.round((t * 7) % 360));
  values.w_thm  = (38 + 12 * Math.sin(t / 9)).toFixed(1);
  values.w_mc   = JSON.stringify({ x: series.x.slice(-24), s: [
      { n: "L1", y: series.y.slice(-24).map(v => +(v * 4.3).toFixed(2)) },
      { n: "L2", y: series.y.slice(-24).map(v => +(v * 4.1).toFixed(2)) },
      { n: "L3", y: series.y.slice(-24).map(v => +(v * 4.5).toFixed(2)) } ] });
  values.w_hist = JSON.stringify({ l: ["00","04","08","12","16","20"],
                                   v: [2,1,6,9,7,4].map(v => v + (t % 3)) });
  values.w_sct  = JSON.stringify({ x: Array.from({length:24},(_,i)=>220+i),
                                   y: Array.from({length:24},(_,i)=>28+8*Math.sin(i/3+t/10)) });
  values.w_heat = JSON.stringify({ w: 8, v: Array.from({length:32},
                                   (_,i)=>+(30+9*Math.sin(i/2+t/6)).toFixed(1)) });
  if (values.w_stp === undefined) values.w_stp = "16";
  if (values.w_rng === undefined) values.w_rng = "18,42";
  if (values.w_drp === undefined) values.w_drp = "Standard";
  if (values.w_rad === undefined) values.w_rad = "L1";
  if (values.w_chk === undefined) values.w_chk = "OCPP|MQTT";
  if (values.w_kno === undefined) values.w_kno = "16";
  if (values.w_xy  === undefined) values.w_xy  = "50,50";
  if (values.w_kpd === undefined) values.w_kpd = "";
  if (values.w_txa === undefined) values.w_txa = "Bay 3, ground floor.\nWest pillar.";
  if (values.w_pwd === undefined) values.w_pwd = "";
  if (values.w_dt  === undefined) values.w_dt  = String(Math.floor(Date.now()/1000) + 3600);
  values.w_qr = "WIFI:S:Vecti-Demo;T:WPA;P:vecti1234;;";

}
tickValues();

const layoutMsg = () => ({
  type: "layout", title: "Vecti EV Charger", brand: "", theme: "auto",
  tabs: TABS,
  cards: CARDS.map(c => ({
    min: 0, max: 100, step: 1, unit: "", color: "default", hidden: false,
    chartType: "line", ...c, value: values[c.id] ?? "",
  })),
});
const updMsg = () => ({
  type: "upd", cards: CARDS.map(c => ({ id: c.id, value: values[c.id] ?? "" })),
});

// serial log stream
let seq = 0;
const LOG_LINES = [
  [1, "session started · connector 2 · 32A"],
  [0, "meter read v=232.4 i=31.0 pf=0.981"],
  [1, "OCPP MeterValues accepted"],
  [2, "rssi -71 dBm — link margin low"],
  [0, "heap 186112 free"],
  [3, "temperature sensor 2 read timeout"],
  [1, "quota 46% of daily allowance"],
];

// ---- HTTP -------------------------------------------------------------------

const APPS = { "/dash": "dash", "/ota": "ota", "/serial": "serial", "/wifi": "net" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (p === "/") { res.writeHead(302, { Location: "/dash" }); return res.end(); }

  if (APPS[p]) {
    const file = path.join(DIST, APPS[p], "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(`build ${APPS[p]} first`); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(file));
  }

  const json = (o) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(o));
  };

  if (p === "/ota/info") return json({
    hwId: "A0:B7:65:2C:19:E4", fwVersion: "1.4.2+mock", title: "Vecti OTA", brand: "",
    freeHeap: 186112, currentSlot: "app0", nextSlot: "app1", freeOta: 1966080,
    slotState: "valid", updating: false, allowFw: true, allowFs: true, allowPull: true,
  });
  if (p === "/wifi/status") return json({
    title: "Vecti Setup", brand: "", state: 2, ssid: "Bay3-Ops", ip: "192.168.1.84",
    gateway: "192.168.1.1", mask: "255.255.255.0", dns: "192.168.1.1",
    bssid: "C4:6E:1F:07:A2:9B", channel: 6, rssi: -58, hostname: "vecti-bay3",
    mdns: "vecti-bay3.local", mac: "A0:B7:65:2C:19:E4", heap: 186112, uptime_s: t * 2,
    uiDefaultTab: "wifi", uiHideWifi: false,
  });
  if (p === "/wifi/scan") return json({ networks: [
    { ssid: "Bay3-Ops",     rssi: -52, ch: 6,  bssid: "C4:6E:1F:07:A2:9B", sec: 1 },
    { ssid: "Vecti-Guest",  rssi: -63, ch: 1,  bssid: "C4:6E:1F:07:A2:9C", sec: 1 },
    { ssid: "SiteCam-24G",  rssi: -71, ch: 11, bssid: "3A:11:9D:44:02:71", sec: 1 },
    { ssid: "OpenDepot",    rssi: -79, ch: 9,  bssid: "8E:22:04:B1:CC:10", sec: 0 },
  ] });
  if (p === "/wifi/params") return json({ params: [
    { key: "sec1",    label: "Application",   type: "header",   value: "", hint: "", opts: "", min: 0, max: 0 },
    { key: "name",    label: "Charger name",  type: "text",     value: "Bay 3", hint: "display name", opts: "", min: 0, max: 0 },
    { key: "mqtt_h",  label: "MQTT host",     type: "text",     value: "broker.local", hint: "fqdn or ip", opts: "", min: 0, max: 0 },
    { key: "mqtt_p",  label: "MQTT port",     type: "number",   value: "1883", hint: "", opts: "", min: 1, max: 65535 },
    { key: "mqtt_pw", label: "MQTT password", type: "password", value: "", hint: "", opts: "", min: 0, max: 0 },
    { key: "region",  label: "Region",        type: "dropdown", value: "IN", hint: "", opts: "EU|US|APAC|IN", min: 0, max: 0 },
    { key: "verbose", label: "Verbose logs",  type: "toggle",   value: "1", hint: "", opts: "", min: 0, max: 0 },
    { key: "sec2",    label: "Identity",      type: "divider",  value: "", hint: "", opts: "", min: 0, max: 0 },
    { key: "fp",      label: "Device fingerprint", type: "display", value: "9f2c-41ab-77de-0c53", hint: "", opts: "", min: 0, max: 0 },
    { key: "notes",   label: "Site notes",    type: "textarea", value: "Ground floor, west pillar.", hint: "", opts: "", min: 0, max: 0 },
  ] });

  if (req.method === "POST") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  res.writeHead(404); res.end("not found");
});

// ---- upgrade ----------------------------------------------------------------

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const room = new URL(req.url, "http://localhost").pathname;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(socket);

  if (room === "/dash/ws") {
    socket.write(encodeText(JSON.stringify(layoutMsg())));
    socket.write(encodeText(JSON.stringify(updMsg())));
  } else if (room === "/serial/ws") {
    socket.write(encodeText(JSON.stringify({
      type: "hist", title: "Vecti Console", brand: "",
      lines: LOG_LINES.map(([lvl, text]) => ({ seq: ++seq, ms: seq * 812, lvl, text })),
    })));
    broadcast("/serial/ws", { type: "clients", n: rooms.get(room).size });
  }

  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const { frames, rest } = decodeFrames(buf);
    buf = rest;
    for (const f of frames) {
      if (f === null) return socket.end();
      let m; try { m = JSON.parse(f); } catch { continue; }
      if (room === "/dash/ws" && m.type === "cmd") {
        values[m.id] = m.value;
        broadcast("/dash/ws", { type: "upd", cards: [{ id: m.id, value: m.value }] });
        broadcast("/dash/ws", { type: "notify", level: "info", message: `${m.id} → ${m.value}`, ttl: 3500 });
      } else if (room === "/dash/ws" && m.type === "hello") {
        socket.write(encodeText(JSON.stringify(layoutMsg())));
        socket.write(encodeText(JSON.stringify(updMsg())));
      } else if (room === "/serial/ws" && m.type === "cmd") {
        broadcast("/serial/ws", { type: "line", seq: ++seq, ms: Date.now() % 1e7, lvl: 1, text: `recv> ${m.text}` });
      }
    }
  });
  const drop = () => {
    rooms.get(room)?.delete(socket);
    if (room === "/serial/ws") broadcast(room, { type: "clients", n: rooms.get(room)?.size || 0 });
  };
  socket.on("close", drop);
  socket.on("error", drop);
});

setInterval(() => {
  tickValues();
  broadcast("/dash/ws", updMsg());
}, 1000);

setInterval(() => {
  const [lvl, text] = LOG_LINES[Math.floor(Math.random() * LOG_LINES.length)];
  broadcast("/serial/ws", { type: "line", seq: ++seq, ms: Date.now() % 1e7, lvl, text });
}, 1400);

server.listen(PORT, () => {
  console.log(`mock device on http://localhost:${PORT}`);
  console.log("  /dash  /ota  /serial  /wifi");
});
