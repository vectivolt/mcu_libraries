// ---------------------------------------------------------------------------
// JouleSuite for ESP32 / ESP8266 — JouleOTA · JouleSerial · JouleNet · JouleDash
// Author: Chinmoy Bhuyan
// Email:  dikibhuyan@gmail.com
// (c) 2026 — MIT License
// ---------------------------------------------------------------------------
//
// Tiny HTTP/WebSocket proxy used to drive headless-browser screenshots of
// the live ESP32 device. preview_start launches this from launch.json on
// the bench Mac, which forwards localhost:PORT → 192.168.1.100:80 over
// the local Wi-Fi. Browser sees a normal local app; WebSockets passthrough.
//
// Usage:
//   PORT=3137 ESP_HOST=192.168.1.100 node tools/preview_proxy.js
const http = require("http"), net = require("net"), url = require("url");

const PORT     = parseInt(process.env.PORT || "3137", 10);
const ESP_HOST = process.env.ESP_HOST || "192.168.1.100";
const ESP_PORT = parseInt(process.env.ESP_PORT || "80", 10);

const server = http.createServer((req, res) => {
  const upstream = http.request({
    host: ESP_HOST, port: ESP_PORT, method: req.method,
    path: req.url, headers: { ...req.headers, host: `${ESP_HOST}:${ESP_PORT}` },
    timeout: 30000,
  }, up => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on("error", e => {
    if (!res.headersSent) { try { res.writeHead(502); res.end("upstream: " + e.message); } catch {} }
    else { try { res.end(); } catch {} }
  });
  req.pipe(upstream);
});

server.on("clientError", () => {});
process.on("uncaughtException", () => {});

// WebSocket upgrade pass-through (raw TCP after the handshake).
server.on("upgrade", (req, clientSock, head) => {
  const upSock = net.connect(ESP_PORT, ESP_HOST, () => {
    const lines = [
      `${req.method} ${req.url} HTTP/1.1`,
      ...Object.entries(req.headers).map(([k,v]) => `${k}: ${v}`),
      "", ""
    ].join("\r\n");
    upSock.write(lines);
    if (head && head.length) upSock.write(head);
    upSock.pipe(clientSock); clientSock.pipe(upSock);
  });
  upSock.on("error", () => clientSock.end());
  clientSock.on("error", () => upSock.end());
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`proxy ready: http://127.0.0.1:${PORT}  →  http://${ESP_HOST}:${ESP_PORT}`);
});
