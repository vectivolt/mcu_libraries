// ---------------------------------------------------------------------------
// JouleSuite for ESP32 / ESP8266 — JouleOTA · JouleSerial · JouleNet · JouleDash
// Author: Chinmoy Bhuyan
// Email:  dikibhuyan@gmail.com
// (c) 2026 — MIT License
// ---------------------------------------------------------------------------

// JouleSuite demo — exercises JouleOTA + JouleSerial + JouleNet + JouleDash
// on a single ESP32-S3 N8R2. Mounts:
//
//   /         → JouleDash (dashboard with live cards)
//   /ota      → JouleOTA  (drag-drop firmware updater)
//   /serial   → JouleSerial (wireless console)
//   /wifi   → JouleNet  (Wi-Fi reconfig + custom parameters)
//
// Wi-Fi behavior:
//   1. Load saved networks from NVS.
//   2. If "Rajesh K" isn't in the saved list, inject it (default creds for
//      this demo board) so a fresh flash connects out of the box.
//   3. autoConnect(); if every saved SSID fails, open the captive portal
//      "Joule-Demo" SoftAP at 192.168.4.1/wifi.
//
// Demo dashboard widgets cycle simulated sensor data so the UI shows life
// the moment a browser connects.

#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>

#include <JouleOTA.h>
#include <JouleSerial.h>
#include <JouleNet.h>
#include <JouleDash.h>

// ---- defaults ----------------------------------------------------------
// NB: Wi-Fi SSIDs are case-sensitive. The router's broadcast name is
// "Rajesh k" with a lowercase k (verified via airport -I on the host Mac
// 2026-05-28). An uppercase "K" yields NO_AP_FOUND immediately on scan.
static constexpr const char *DEFAULT_SSID    = "Rajesh k";
static constexpr const char *DEFAULT_PASS    = "Vishu2012";
static constexpr const char *AP_FALLBACK_SSID= "Joule-Demo";
static constexpr const char *HOSTNAME        = "joule-demo";
static constexpr const char *FW_VERSION      = "1.0.0+demo";

// Single shared async HTTP server. Each library mounts its own routes on
// top of this one (so /, /ota, /serial, /wifi, /dash/ws all coexist).
AsyncWebServer server(80);

// ---- dashboard widgets -------------------------------------------------
// All cards are global so they outlive setup() — JouleDash holds raw
// pointers, mutating them in loop() is fine because tick() does the
// thread-safe broadcast.
using joule::DashCard;
using joule::DashType;
using joule::DashColor;

DashCard cTemp   (DashType::Temperature, "temp",  "Temperature", "°C");
DashCard cHumid  (DashType::Humidity,    "hum",   "Humidity",    "%");
DashCard cRssi   (DashType::Number,      "rssi",  "Wi-Fi RSSI",  "dBm");
DashCard cHeap   (DashType::Number,      "heap",  "Free heap",   "KB");
DashCard cUptime (DashType::Number,      "up",    "Uptime",      "s");
DashCard cLed    (DashType::Switch,      "led",   "Onboard LED");
DashCard cBright (DashType::Slider,      "bright","Brightness",  "%");
DashCard cReboot (DashType::Button,      "rb",    "Reboot now");
DashCard cGauge  (DashType::Gauge,       "g1",    "CPU load",    "%");
DashCard cProg   (DashType::Progress,    "p1",    "Cycle",       "%");
DashCard cStatus (DashType::Status,      "st",    "Charger");
DashCard cChart  (DashType::Chart,       "ch",    "Temperature trend");
DashCard cJoy    (DashType::Joystick,    "j1",    "Joystick");
DashCard cColor  (DashType::Color,       "c1",    "Brand color");
DashCard cInput  (DashType::Input,       "note",  "Note");
DashCard cCustom (DashType::Custom,      "cus",   "Custom HTML");
DashCard cDonut  (DashType::Donut,       "dn",    "Battery",     "%");

// ---- helpers -----------------------------------------------------------

// Inject the lab default Wi-Fi creds if no networks are saved yet, so
// flashing a brand-new board connects to "Rajesh K" without ever opening
// the portal. After the first successful join JouleNet persists the
// credentials, so subsequent reflashes pick them up from NVS regardless.
static void seedDefaultWiFiIfEmpty() {
  // If NVS already holds entries that don't include the known-good SSID
  // (e.g. a previous flash burned in a typo), wipe the lot so the device
  // can't get stuck retrying a never-going-to-work name. Then ensure the
  // correct SSID is in the saved list.
  bool hasCorrect = false;
  for (auto &n : JouleNet.savedNetworks()) if (n.ssid == DEFAULT_SSID) { hasCorrect = true; break; }
  if (!hasCorrect) {
    if (!JouleNet.savedNetworks().empty()) {
      JouleSerial.wrn("Wiping stale Wi-Fi creds (none matched '%s')", DEFAULT_SSID);
      JouleNet.clearAllCredentials();
    }
    JouleSerial.inf("Seeding default Wi-Fi '%s'", DEFAULT_SSID);
    JouleNet.saveCredentials(DEFAULT_SSID, DEFAULT_PASS);
  }
}

static void setupNet() {
  JouleNet.setApCredentials(AP_FALLBACK_SSID, "");        // open AP for setup
  JouleNet.setHostname(HOSTNAME);
  JouleNet.setMdnsName(HOSTNAME);
  JouleNet.setPortalTimeoutMs(0);                         // keep portal up
  JouleNet.setConnectTimeoutMs(20000);
  JouleNet.setReprovisionMs(120000);
  JouleNet.setBrandColor("#7c5cff");
  JouleNet.setTitle("JouleSuite Setup");

  // Custom parameters — exercise every supported widget type so the Setup
  // tab renders the full toolbox.
  JouleNet.addParameter({"section1","Application",  joule::NetParamType::Header,  "","","",0,0});
  JouleNet.addParameter({"room",    "Room name",    joule::NetParamType::Text,    "Lab","where is this device?","",0,0});
  JouleNet.addParameter({"mqtt_host","MQTT host",   joule::NetParamType::Text,    "broker.local","fqdn or ip","",0,0});
  JouleNet.addParameter({"mqtt_port","MQTT port",   joule::NetParamType::Number,  "1883","","",1,65535});
  JouleNet.addParameter({"mqtt_pw", "MQTT password",joule::NetParamType::Password,"","","",0,0});
  JouleNet.addParameter({"region",  "Region",       joule::NetParamType::Dropdown,"EU","","EU|US|APAC|other",0,0});
  JouleNet.addParameter({"brand_c", "Accent color", joule::NetParamType::Color,   "#7c5cff","","",0,0});
  JouleNet.addParameter({"verbose", "Verbose logs", joule::NetParamType::Toggle,  "1","","",0,0});
  JouleNet.addParameter({"section2","Notes",        joule::NetParamType::Divider, "","","",0,0});
  JouleNet.addParameter({"notes",   "Site notes",   joule::NetParamType::Textarea,"installed by site team\nfront entrance, bay 3","free-form","",0,0});

  JouleNet.begin(&server);
  seedDefaultWiFiIfEmpty();

  JouleNet.onState([](joule::NetState s){
    const char *names[] = {"idle","connecting","connected","portal","failed"};
    JouleSerial.inf("netState=%s", names[(int)s]);
    if (s == joule::NetState::Connected) {
      JouleDash.notify(joule::NotifyLevel::Success,
                       String("Wi-Fi connected: ") + WiFi.SSID() + " @ " + WiFi.localIP().toString());
    } else if (s == joule::NetState::Portal) {
      JouleDash.notify(joule::NotifyLevel::Warn,
                       String("Setup portal up at AP ") + AP_FALLBACK_SSID);
    }
  });
}

static void setupOta() {
  JouleOTA.setID(WiFi.macAddress());
  JouleOTA.setFWVersion(FW_VERSION);
  JouleOTA.setTitle("JouleSuite OTA");
  JouleOTA.setBrandColor("#7c5cff");
  JouleOTA.setRateLimitMs(2000);
  JouleOTA.setRollbackTimeoutMs(0);                       // demo: don't auto-rollback

  JouleOTA.onStart   ([](joule::OtaMode m){ JouleSerial.wrn("OTA start mode=%s", m==joule::OtaMode::Filesystem?"fs":"fw"); });
  JouleOTA.onProgress([](size_t cur, size_t tot){
    static int last=-5;
    int pct = tot? (int)((cur*100)/tot) : 0;
    if (pct >= last+5){ last=pct; JouleSerial.dbg("OTA %d%%  %u/%u", pct, (unsigned)cur, (unsigned)tot); }
  });
  JouleOTA.onEnd     ([](bool ok, const String &m){
    JouleSerial.inf("OTA end ok=%d msg=%s", ok, m.c_str());
    JouleDash.notify(ok?joule::NotifyLevel::Success:joule::NotifyLevel::Error,
                     ok?"Update complete — rebooting":(String("Update failed: ")+m));
  });

  // Auth deliberately disabled in the demo: HTTP Basic doubles the round-
  // trip count (401 challenge → request with creds) and the second leg
  // fails reliably on RSSI worse than ~-85 dBm on this bench. Production
  // sketches should pass "admin","joule" (or stronger) here.
  JouleOTA.begin(&server, "", "");
  JouleOTA.commit();                                      // accept this firmware
}

static void setupSerial() {
  JouleSerial.setTitle("JouleSuite Console");
  JouleSerial.setBrandColor("#2ee5a0");
  JouleSerial.setHistorySize(512);
  JouleSerial.onMessage([](const String &cmd){
    JouleSerial.inf("recv> %s", cmd.c_str());
    if      (cmd == "reboot") { JouleSerial.wrn("rebooting in 1s"); delay(1000); ESP.restart(); }
    else if (cmd == "scan")   { WiFi.scanNetworks(true); JouleSerial.inf("scan started"); }
    else if (cmd == "heap")   { JouleSerial.inf("heap = %u bytes", ESP.getFreeHeap()); }
    else if (cmd == "wipe-wifi") { JouleNet.clearAllCredentials(); JouleSerial.wrn("WiFi creds wiped"); }
    else if (cmd.startsWith("notify ")) { JouleDash.notify(joule::NotifyLevel::Info, cmd.substring(7)); }
    else JouleSerial.dbg("unknown cmd '%s' — try: reboot scan heap wipe-wifi 'notify <msg>'", cmd.c_str());
  });
  JouleSerial.begin(&server, "", "");   // demo: no auth (see JouleOTA note)
}

static void setupDash() {
  JouleDash.setTitle("JouleSuite Dashboard");
  JouleDash.setBrandColor("#7c5cff");
  JouleDash.setTheme("auto");
  JouleDash.addTab("Overview");
  JouleDash.addTab("Controls");
  JouleDash.addTab("Charts");

  // Tab assignments + sizing (12-col grid).
  cTemp  .setTab("Overview"); cTemp .setWidth(3); cTemp .setColor(DashColor::Info);
  cHumid .setTab("Overview"); cHumid.setWidth(3); cHumid.setColor(DashColor::Info);
  cRssi  .setTab("Overview"); cRssi .setWidth(3);
  cHeap  .setTab("Overview"); cHeap .setWidth(3);
  cUptime.setTab("Overview"); cUptime.setWidth(6);
  cStatus.setTab("Overview"); cStatus.setWidth(6); cStatus.setColor(DashColor::Success);
  cCustom.setTab("Overview"); cCustom.setWidth(12);

  cLed   .setTab("Controls"); cLed   .setWidth(3);
  cBright.setTab("Controls"); cBright.setWidth(6); cBright.setRange(0, 100);
  cReboot.setTab("Controls"); cReboot.setWidth(3); cReboot.setColor(DashColor::Danger);
  cJoy   .setTab("Controls"); cJoy   .setWidth(6);
  cColor .setTab("Controls"); cColor .setWidth(3);
  cInput .setTab("Controls"); cInput .setWidth(3);

  cGauge .setTab("Charts");   cGauge .setWidth(4); cGauge.setRange(0, 100);
  cProg  .setTab("Charts");   cProg  .setWidth(4); cProg.setRange(0, 100);
  cDonut .setTab("Charts");   cDonut .setWidth(4); cDonut.setRange(0, 100);
  cChart .setTab("Charts");   cChart .setWidth(12);

  // Custom HTML — proves the escape-hatch widget. The firmware updates the
  // span#dash-cus-out automatically with every setValue() broadcast.
  cCustom.setCustomHtml(
    "<div style='display:flex;gap:18px;align-items:center;flex-wrap:wrap'>"
    "<div style='font-size:34px'>⚡</div>"
    "<div><div style='font-size:11px;color:var(--muted)'>Custom widget — your HTML in our card</div>"
    "<div style='font-family:ui-monospace,Menlo,monospace'>last tick: <span id='dash-cus-out'>—</span></div></div></div>"
  );
  cStatus.setValue("ok");
  cColor .setValue("#7c5cff");

  // Wire interactive widgets to host-side effects.
  pinMode(LED_BUILTIN, OUTPUT);
  cLed.onChange([](const String &v){
    bool on = (v == "1");
    digitalWrite(LED_BUILTIN, on ? HIGH : LOW);
    JouleSerial.inf("LED %s", on ? "ON" : "OFF");
  });
  cBright.onChange([](const String &v){
    JouleSerial.dbg("brightness=%s%%", v.c_str());
    // Real PWM would go here. We just log it for the demo.
  });
  cReboot.onChange([](const String &v){
    if (v == "1") {
      JouleDash.notify(joule::NotifyLevel::Warn, "Rebooting in 1s…", 1000);
      delay(1100); ESP.restart();
    }
  });
  cJoy.onChange([](const String &v){
    JouleSerial.dbg("joystick %s", v.c_str());
  });
  cColor.onChange([](const String &v){
    JouleSerial.inf("brand color → %s", v.c_str());
    JouleDash.setBrandColor(v);
    JouleDash.refreshLayout();
  });
  cInput.onChange([](const String &v){
    JouleSerial.inf("note: %s", v.c_str());
    JouleDash.notify(joule::NotifyLevel::Info, String("Saved: ") + v);
  });

  JouleDash.add(&cTemp); JouleDash.add(&cHumid); JouleDash.add(&cRssi); JouleDash.add(&cHeap);
  JouleDash.add(&cUptime); JouleDash.add(&cStatus); JouleDash.add(&cCustom);
  JouleDash.add(&cLed); JouleDash.add(&cBright); JouleDash.add(&cReboot);
  JouleDash.add(&cJoy); JouleDash.add(&cColor); JouleDash.add(&cInput);
  JouleDash.add(&cGauge); JouleDash.add(&cProg); JouleDash.add(&cDonut); JouleDash.add(&cChart);

  // Anonymous read-only so the dashboard is browseable without auth,
  // but interactions still go through HTTP basic.
  JouleDash.begin(&server, "admin", "joule", true);
}

// ---- arduino entry points ----------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("== JouleSuite demo ==");

  // Network first so the captive portal can come up before anything else
  // tries to log over the wireless console.
  setupNet();
  setupSerial();
  setupOta();
  setupDash();

  server.begin();
  JouleSerial.inf("HTTP server started on port 80");
  JouleSerial.inf("Routes: / (dash)  /ota  /serial  /wifi");
  JouleSerial.inf("mDNS: http://%s.local", HOSTNAME);

  JouleNet.autoConnect();
}

void loop() {
  JouleNet.loop();
  JouleOTA.loop();
  JouleSerial.loop();
  JouleDash.tick();

  // Simulated telemetry — 1 Hz tick.
  static uint32_t last = 0;
  static uint32_t startMs = millis();
  static uint32_t chartT = 0;
  if (millis() - last >= 1000) {
    last = millis();
    float t = 22.0f + 3.0f * sin((millis() % 60000) / 9550.0f);
    float h = 45.0f + 4.0f * cos((millis() % 60000) / 7200.0f);
    cTemp  .setValue(t, 2);
    cHumid .setValue(h, 1);
    cRssi  .setValue(WiFi.RSSI());
    cHeap  .setValue((int)(ESP.getFreeHeap() / 1024));
    cUptime.setValue((int)((millis() - startMs) / 1000));
    cGauge .setValue((int)(30 + 50.0 * (0.5 + 0.5 * sin(millis()/3200.0))));
    cProg  .setValue((int)((millis() / 100) % 101));
    cDonut .setValue((int)(50 + 40.0 * sin(millis()/4800.0)));
    cCustom.setValue(String(millis()/1000) + "s · t=" + String(t,1) + "°C");
    if (millis() - chartT > 1000) {
      chartT = millis();
      cChart.chartPushXY(millis()/1000.0f, t);
    }
  }
}
