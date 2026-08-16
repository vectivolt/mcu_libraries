/* ---------------------------------------------------------------------------
 * VectiSuite — small runtime helpers shared by the four SPAs.
 *
 * Everything here exists because these pages run in a hostile environment
 * that a normal web app never sees: plain HTTP on a link-local address, a
 * radio that drops mid-frame, and a browser whose storage may be blocked.
 *
 * (c) 2026 VectiVolt — Apache-2.0 License
 * ------------------------------------------------------------------------- */

/**
 * Unique-enough id for list keys and toasts.
 *
 * NOT crypto.randomUUID(): that is gated behind a secure context, and these
 * pages are served over plain http:// from an IP literal (http://192.168.4.1),
 * which is not one. On a real device crypto.randomUUID is undefined and the
 * call throws, so anything built on it silently stopped working the moment it
 * left localhost.
 */
let _seq = 0;
export const uid = () => `${Date.now().toString(36)}-${(_seq++).toString(36)}`;

/**
 * localStorage that cannot throw.
 *
 * Access throws outright in Safari private mode and wherever third-party
 * storage is blocked; an uncaught throw at module scope takes the whole page
 * down before it renders. Falls back to an in-memory map for the session.
 */
const _mem = new Map();
export const store = {
  get(key, fallback = null) {
    try { return localStorage.getItem(key) ?? _mem.get(key) ?? fallback; }
    catch { return _mem.get(key) ?? fallback; }
  },
  set(key, value) {
    _mem.set(key, value);
    try { localStorage.setItem(key, value); } catch { /* memory-only */ }
  },
};

/**
 * Auto-reconnecting WebSocket.
 *
 * Reconnect uses exponential backoff with jitter, not a fixed interval. A
 * fixed 1.5s retry from every open tab turns a rebooting ESP32 into a
 * thundering herd: the device comes up, four tabs hit the accept queue in
 * the same tick, and AsyncTCP drops connections it cannot allocate.
 *
 * Returns a handle; call .close() to stop for good (it will not reconnect).
 */
export function reconnectingSocket(path, { onMessage, onOpen, onClose } = {}) {
  let ws = null;
  let attempt = 0;
  let timer = null;
  let stopped = false;

  const url = () =>
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${path}`;

  function connect() {
    if (stopped) return;
    try { ws = new WebSocket(url()); }
    catch { return schedule(); }          // malformed URL / blocked scheme

    ws.onopen = () => { attempt = 0; onOpen?.(); };
    ws.onmessage = (e) => {
      let msg;
      // A truncated frame from a device that rebooted mid-send is normal
      // here, not exceptional — drop it rather than killing the handler.
      try { msg = JSON.parse(e.data); } catch { return; }
      onMessage?.(msg);
    };
    ws.onclose = () => { onClose?.(); schedule(); };
    // An error is always followed by a close, so reconnect is driven from
    // onclose only. Doing it in both schedules two overlapping sockets.
    ws.onerror = () => {};
  }

  function schedule() {
    if (stopped || timer) return;
    const base = Math.min(500 * 2 ** attempt++, 15000);
    const wait = base * (0.7 + Math.random() * 0.6);   // ±30% jitter
    timer = setTimeout(() => { timer = null; connect(); }, wait);
  }

  connect();

  return {
    send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    },
    close() {
      stopped = true;
      clearTimeout(timer); timer = null;
      // Detach before closing: otherwise our own close() fires onclose and
      // schedules a reconnect for a socket the caller just discarded.
      if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); ws = null; }
    },
  };
}

/** Human-readable byte count. */
export function fmtBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  n = Number(n);
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

/**
 * parseFloat that does not treat a legitimate 0 as "missing".
 *
 * `parseFloat(v) || min` reads as a sensible default and is wrong: 0 is
 * falsy, so a slider or gauge sitting at zero snapped to its minimum and a
 * 0 kW reading rendered as the bottom of the range.
 */
export function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Clamp helper for gauge/donut/progress fractions. */
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
