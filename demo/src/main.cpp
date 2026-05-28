// ---------------------------------------------------------------------------
// JouleSuite for ESP32 / ESP8266 — JouleOTA · JouleSerial · JouleNet · JouleDash
// Author: Chinmoy Bhuyan
// Email:  dikibhuyan@gmail.com
// (c) 2026 — MIT License
// ---------------------------------------------------------------------------
//
// JouleSuite combined demo for ESP32-S3 N8R2.
//
// Spins up a polished, EV-charger-themed dashboard that exercises every
// widget type in JouleDash plus the OTA / Serial / Wi-Fi UIs at the same
// time. All four libraries share one AsyncWebServer instance.
//
//   /         → JouleDash (302 → /dash)
//   /dash     → JouleDash · 4 tabs of live energy / status / control widgets
//   /ota      → JouleOTA  · drag-drop firmware updater
//   /serial   → JouleSerial · wireless console
//   /wifi     → JouleNet  · provisioning portal + custom params
//
// Simulated telemetry is sized to look like a real 7.2 kW Level-2 AC
// charging session so the dashboard screenshot is meaningful, not toy.

#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>

#include <JouleOTA.h>
#include <JouleSerial.h>
#include <JouleNet.h>
#include <JouleDash.h>

#include <math.h>

// ---- defaults ----------------------------------------------------------
static constexpr const char *DEFAULT_SSID    = "Rajesh k";   // lower-case k
static constexpr const char *DEFAULT_PASS    = "Vishu2012";
static constexpr const char *AP_FALLBACK_SSID= "Joule-Demo";
static constexpr const char *HOSTNAME        = "joule-demo";
static constexpr const char *FW_VERSION      = "1.0.0+demo";
// Unified JouleSuite brand: Indigo 500. Same family as the gradient companion
// (Violet) baked into the UI CSS so the hero card, buttons, gauges, charts,
// and tab pills all sit in one harmonious palette.
static constexpr const char *BRAND_HEX       = "#6366f1";    // Indigo 500

AsyncWebServer server(80);

using joule::DashCard;
using joule::DashType;
using joule::DashColor;

// ---- Overview tab — hero + live energy / session telemetry ----------------

DashCard hero    (DashType::Custom,      "hero",   "JouleSuite EV charger");
DashCard cPower  (DashType::Number,      "pwr",    "Power output",   "kW");
DashCard cEnergy (DashType::Number,      "kwh",    "Energy delivered","kWh");
DashCard cCost   (DashType::Number,      "cost",   "Session cost",   "₹");
DashCard cSess   (DashType::Number,      "sess",   "Session time",   "min");
DashCard cState  (DashType::Status,      "st",     "Charger state");
DashCard cSoc    (DashType::Donut,       "soc",    "Battery SoC",    "%");
DashCard cChargeG(DashType::Gauge,       "cg",     "Charge power",   "kW");

// ---- Energy tab — phase + power detail -----------------------------------

DashCard cV1     (DashType::Number,      "v1",     "Voltage L1",     "V");
DashCard cI1     (DashType::Number,      "i1",     "Current L1",     "A");
DashCard cPF     (DashType::Number,      "pf",     "Power factor",   "");
DashCard cFreq   (DashType::Number,      "f",      "Frequency",      "Hz");
DashCard cQuota  (DashType::Progress,    "q",      "Daily quota",    "%");
DashCard cGreen  (DashType::Donut,       "gn",     "Renewable mix",  "%");
DashCard cTrend  (DashType::Chart,       "tr",     "Power over time");

// ---- Controls tab — interactive widgets ----------------------------------

DashCard cStart  (DashType::Switch,      "start",  "Start session");
DashCard cLimit  (DashType::Slider,      "lim",    "Current limit",  "A");
DashCard cMode   (DashType::Slider,      "mode",   "Charge mode",    "");
DashCard cLed    (DashType::Color,       "led",    "LED ring colour");
DashCard cStop   (DashType::Button,      "estop",  "Emergency STOP");
DashCard cReboot (DashType::Button,      "rb",     "Reboot device");
DashCard cJoy    (DashType::Joystick,    "joy",    "Camera pan / tilt");
DashCard cTag    (DashType::Input,       "tag",    "Driver RFID tag");

// ---- Diagnostics tab -----------------------------------------------------

DashCard cTemp   (DashType::Temperature, "tmp",    "PCB temperature","°C");
DashCard cHumid  (DashType::Humidity,    "hum",    "Cabinet humidity","%");
DashCard cRssi   (DashType::Number,      "rssi",   "Wi-Fi RSSI",     "dBm");
DashCard cHeap   (DashType::Number,      "heap",   "Free heap",      "KB");
DashCard cUp     (DashType::Number,      "up",     "Uptime",         "s");
DashCard cNet    (DashType::Status,      "net",    "Network link");
DashCard cOcpp   (DashType::Status,      "ocpp",   "OCPP backend");
DashCard cRssiCh (DashType::Chart,       "rch",    "RSSI history");

// ---- helpers -----------------------------------------------------------

static void seedDefaultWiFiIfEmpty() {
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
  JouleNet.setApCredentials(AP_FALLBACK_SSID, "");
  JouleNet.setHostname(HOSTNAME);
  JouleNet.setMdnsName(HOSTNAME);
  JouleNet.setPortalTimeoutMs(0);
  JouleNet.setConnectTimeoutMs(20000);
  JouleNet.setReprovisionMs(120000);
  JouleNet.setBrandColor(BRAND_HEX);
  JouleNet.setTitle("JouleSuite Setup");

  // Custom parameters covering every supported type.
  JouleNet.addParameter({"sec1",    "Application",  joule::NetParamType::Header,  "","","",0,0});
  JouleNet.addParameter({"name",    "Charger name", joule::NetParamType::Text,    "Bay 3 · JouleSuite Demo","display name","",0,0});
  JouleNet.addParameter({"mqtt_h",  "MQTT host",    joule::NetParamType::Text,    "broker.local","fqdn or ip","",0,0});
  JouleNet.addParameter({"mqtt_p",  "MQTT port",    joule::NetParamType::Number,  "1883","","",1,65535});
  JouleNet.addParameter({"mqtt_pw", "MQTT password",joule::NetParamType::Password,"","","",0,0});
  JouleNet.addParameter({"region",  "Region",       joule::NetParamType::Dropdown,"IN","","EU|US|APAC|IN|other",0,0});
  JouleNet.addParameter({"accent",  "Accent colour",joule::NetParamType::Color,   BRAND_HEX,"","",0,0});
  JouleNet.addParameter({"verbose", "Verbose logs", joule::NetParamType::Toggle,  "1","","",0,0});
  JouleNet.addParameter({"sec2",    "Notes",        joule::NetParamType::Divider, "","","",0,0});
  JouleNet.addParameter({"notes",   "Site notes",   joule::NetParamType::Textarea,
                         "Bay 3, ground floor.\nMounted on west pillar.\nKey under reception.","free-form","",0,0});

  JouleNet.begin(&server);
  seedDefaultWiFiIfEmpty();

  JouleNet.onState([](joule::NetState s){
    const char *names[] = {"idle","connecting","connected","portal","failed"};
    JouleSerial.inf("netState=%s", names[(int)s]);
    if (s == joule::NetState::Connected) {
      JouleDash.notify(joule::NotifyLevel::Success,
        String("Connected: ") + WiFi.SSID() + " · " + WiFi.localIP().toString());
    }
  });
}

static void setupOta() {
  JouleOTA.setID(WiFi.macAddress());
  JouleOTA.setFWVersion(FW_VERSION);
  JouleOTA.setTitle("JouleSuite OTA");
  JouleOTA.setBrandColor(BRAND_HEX);
  JouleOTA.setRateLimitMs(2000);

  JouleOTA.onProgress([](size_t cur, size_t tot){
    static int last = -5;
    int pct = tot ? (int)((cur * 100) / tot) : 0;
    if (pct >= last + 5) { last = pct; JouleSerial.dbg("OTA %d%%", pct); }
  });
  JouleOTA.onEnd([](bool ok, const String &m){
    JouleSerial.inf("OTA end ok=%d msg=%s", ok, m.c_str());
    JouleDash.notify(ok ? joule::NotifyLevel::Success : joule::NotifyLevel::Error,
                     ok ? "Update complete — rebooting" : (String("Update failed: ") + m));
  });

  JouleOTA.begin(&server, "", "");        // demo: no auth (see README)
  JouleOTA.commit();
}

static void setupSerial() {
  JouleSerial.setTitle("JouleSuite Console");
  JouleSerial.setBrandColor("#10b981");
  JouleSerial.setHistorySize(512);
  JouleSerial.onMessage([](const String &cmd){
    JouleSerial.inf("recv> %s", cmd.c_str());
    if      (cmd == "reboot")     { JouleSerial.wrn("rebooting in 1s"); delay(1000); ESP.restart(); }
    else if (cmd == "scan")       { WiFi.scanNetworks(true); JouleSerial.inf("scan started"); }
    else if (cmd == "heap")       { JouleSerial.inf("heap = %u bytes", ESP.getFreeHeap()); }
    else if (cmd == "wipe-wifi")  { JouleNet.clearAllCredentials(); JouleSerial.wrn("WiFi creds wiped"); }
    else if (cmd.startsWith("notify ")) JouleDash.notify(joule::NotifyLevel::Info, cmd.substring(7));
    else JouleSerial.dbg("unknown '%s' — try: reboot scan heap wipe-wifi 'notify <msg>'", cmd.c_str());
  });
  JouleSerial.begin(&server, "", "");
}

static void setupDash() {
  JouleDash.setTitle("JouleSuite EV Charger");
  JouleDash.setBrandColor(BRAND_HEX);
  JouleDash.setTheme("auto");
  JouleDash.addTab("Overview");
  JouleDash.addTab("Energy");
  JouleDash.addTab("Controls");
  JouleDash.addTab("Diagnostics");

  // ---- Overview --------------------------------------------------------
  hero.setTab("Overview"); hero.setWidth(12);
  hero.setCustomHtml(
    "<div style='display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:6px 4px'>"
      "<div style='width:64px;height:64px;border-radius:16px;display:grid;place-items:center;"
          "background:var(--grad);box-shadow:0 10px 30px color-mix(in srgb,var(--brand) 35%,transparent);"
          "font-size:30px;color:#fff'>⚡</div>"
      "<div style='flex:1;min-width:220px'>"
        "<div style='font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);font-weight:700'>"
          "Bay 3 · JouleSuite Demo</div>"
        "<div style='font-size:24px;font-weight:800;background:var(--grad);"
          "-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1'>"
          "<span id='dash-hero-out'>Charging · 7.2 kW</span></div>"
        "<div style='font-size:12px;color:var(--muted);margin-top:4px'>"
          "OCPP 1.6 · CCS2 connector · 32 A type-2 cable</div>"
      "</div>"
      "<div style='display:flex;gap:8px;flex-wrap:wrap'>"
        "<span style='padding:6px 12px;border-radius:99px;background:color-mix(in srgb,var(--ok) 18%,transparent);"
            "color:var(--ok);font-weight:700;font-size:12px'>● live</span>"
        "<span style='padding:6px 12px;border-radius:99px;background:color-mix(in srgb,var(--brand) 18%,transparent);"
            "color:var(--brand);font-weight:700;font-size:12px'>RFID linked</span>"
      "</div>"
    "</div>");

  cPower .setTab("Overview"); cPower .setWidth(3); cPower .setColor(DashColor::Info);
  cEnergy.setTab("Overview"); cEnergy.setWidth(3); cEnergy.setColor(DashColor::Success);
  cCost  .setTab("Overview"); cCost  .setWidth(3); cCost  .setColor(DashColor::Primary);
  cSess  .setTab("Overview"); cSess  .setWidth(3);
  cState .setTab("Overview"); cState .setWidth(4); cState.setValue("ok");
  cSoc   .setTab("Overview"); cSoc   .setWidth(4); cSoc.setRange(0,100);
  cChargeG.setTab("Overview");cChargeG.setWidth(4);cChargeG.setRange(0,22);

  // ---- Energy ----------------------------------------------------------
  cV1   .setTab("Energy");  cV1   .setWidth(3); cV1.setColor(DashColor::Info);
  cI1   .setTab("Energy");  cI1   .setWidth(3); cI1.setColor(DashColor::Warning);
  cPF   .setTab("Energy");  cPF   .setWidth(3);
  cFreq .setTab("Energy");  cFreq .setWidth(3);
  cQuota.setTab("Energy");  cQuota.setWidth(6); cQuota.setRange(0,100);
  cGreen.setTab("Energy");  cGreen.setWidth(6); cGreen.setRange(0,100); cGreen.setColor(DashColor::Success);
  cTrend.setTab("Energy");  cTrend.setWidth(12);

  // ---- Controls --------------------------------------------------------
  cStart .setTab("Controls"); cStart .setWidth(3);
  cLimit .setTab("Controls"); cLimit .setWidth(6); cLimit.setRange(6,32);  cLimit.setStep(1);
  cMode  .setTab("Controls"); cMode  .setWidth(3); cMode .setRange(0,3);   cMode .setStep(1);
  cLed   .setTab("Controls"); cLed   .setWidth(3);
  cStop  .setTab("Controls"); cStop  .setWidth(3); cStop .setColor(DashColor::Danger);
  cReboot.setTab("Controls"); cReboot.setWidth(3); cReboot.setColor(DashColor::Warning);
  cJoy   .setTab("Controls"); cJoy   .setWidth(6);
  cTag   .setTab("Controls"); cTag   .setWidth(6);

  // ---- Diagnostics -----------------------------------------------------
  cTemp  .setTab("Diagnostics"); cTemp  .setWidth(3);
  cHumid .setTab("Diagnostics"); cHumid .setWidth(3);
  cRssi  .setTab("Diagnostics"); cRssi  .setWidth(3);
  cHeap  .setTab("Diagnostics"); cHeap  .setWidth(3);
  cUp    .setTab("Diagnostics"); cUp    .setWidth(4);
  cNet   .setTab("Diagnostics"); cNet   .setWidth(4); cNet.setValue("ok");
  cOcpp  .setTab("Diagnostics"); cOcpp  .setWidth(4); cOcpp.setValue("ok");
  cRssiCh.setTab("Diagnostics"); cRssiCh.setWidth(12);

  // ---- Interactive callbacks ------------------------------------------
  pinMode(LED_BUILTIN, OUTPUT);
  cStart.onChange([](const String &v){
    bool on = v == "1";
    digitalWrite(LED_BUILTIN, on ? HIGH : LOW);
    JouleDash.notify(on ? joule::NotifyLevel::Success : joule::NotifyLevel::Info,
                     on ? "Session started" : "Session stopped");
  });
  cLimit .onChange([](const String &v){ JouleSerial.inf("current limit → %sA", v.c_str()); });
  cMode  .onChange([](const String &v){
    const char *names[]={"Standard","Eco","Boost","Solar"};
    int n = constrain(v.toInt(), 0, 3);
    JouleSerial.inf("mode → %s", names[n]);
    JouleDash.notify(joule::NotifyLevel::Info, String("Mode: ") + names[n]);
  });
  cLed   .onChange([](const String &v){
    JouleSerial.inf("LED ring → %s", v.c_str());
    JouleDash.setBrandColor(v);
    JouleDash.refreshLayout();
  });
  cStop  .onChange([](const String &){
    JouleDash.notify(joule::NotifyLevel::Error, "Emergency STOP triggered");
    JouleSerial.err("E-STOP");
  });
  cReboot.onChange([](const String &){
    JouleDash.notify(joule::NotifyLevel::Warn, "Rebooting in 1s…", 1000);
    delay(1100); ESP.restart();
  });
  cTag   .onChange([](const String &v){
    JouleSerial.inf("Driver tag: %s", v.c_str());
    JouleDash.notify(joule::NotifyLevel::Success, String("RFID: ") + v + " · authorized");
  });

  // ---- Register every card ---------------------------------------------
  JouleDash.add(&hero);
  JouleDash.add(&cPower); JouleDash.add(&cEnergy); JouleDash.add(&cCost); JouleDash.add(&cSess);
  JouleDash.add(&cState); JouleDash.add(&cSoc);    JouleDash.add(&cChargeG);
  JouleDash.add(&cV1);    JouleDash.add(&cI1);     JouleDash.add(&cPF);   JouleDash.add(&cFreq);
  JouleDash.add(&cQuota); JouleDash.add(&cGreen);  JouleDash.add(&cTrend);
  JouleDash.add(&cStart); JouleDash.add(&cLimit);  JouleDash.add(&cMode); JouleDash.add(&cLed);
  JouleDash.add(&cStop);  JouleDash.add(&cReboot); JouleDash.add(&cJoy);  JouleDash.add(&cTag);
  JouleDash.add(&cTemp);  JouleDash.add(&cHumid);  JouleDash.add(&cRssi); JouleDash.add(&cHeap);
  JouleDash.add(&cUp);    JouleDash.add(&cNet);    JouleDash.add(&cOcpp); JouleDash.add(&cRssiCh);

  JouleDash.begin(&server, "", "", /*allowAnonymousRead=*/true);
}

void setup() {
  Serial.begin(115200);
  delay(300); Serial.println("\n== JouleSuite demo ==");

  setupNet();
  setupSerial();
  setupOta();
  setupDash();

  server.begin();
  JouleSerial.inf("HTTP server up — routes: / /dash /ota /serial /wifi");
  JouleSerial.inf("mDNS: http://%s.local", HOSTNAME);
  JouleNet.autoConnect();

  // Seed Energy + RSSI charts with a plausible warm-up curve so the first
  // viewer of the dashboard sees something interesting immediately.
  for (int i = 0; i < 30; i++) {
    float t = i;
    cTrend  .chartPushXY(t, 7.0f + 0.3f * sinf(i / 4.0f));
    cRssiCh .chartPushXY(t, -70 + 8 * sinf(i / 5.0f));
  }
}

void loop() {
  JouleNet.loop();
  JouleOTA.loop();
  JouleSerial.loop();
  JouleDash.tick();

  static uint32_t last = 0, startMs = millis(), chartT = 0, notifyT = millis();
  uint32_t now = millis();
  if (now - last < 1000) return;
  last = now;

  // ----- Plausible 7.2 kW Level-2 charging session ---------------------
  float sessionS  = (now - startMs) / 1000.0f;
  float sessionM  = sessionS / 60.0f;
  float power     = 7.0f + 0.4f * sinf(sessionS / 11.0f);   // ~7 kW with sway
  float energy    = power * sessionS / 3600.0f;              // kWh delivered
  int   socPct    = (int)constrain(45 + (energy * 8.0f), 45.0f, 100.0f);
  float voltage   = 230.0f + 1.4f * sinf(sessionS / 7.0f);
  float current   = (power * 1000.0f) / voltage;
  float pf        = 0.97f + 0.015f * sinf(sessionS / 9.0f);
  float freq      = 50.0f + 0.05f * sinf(sessionS / 13.0f);
  int   greenMix  = (int)constrain(60 + 25.0f * sinf(sessionS / 17.0f), 0.0f, 100.0f);
  int   quota     = (int)constrain(energy * 4.0f, 0.0f, 100.0f);
  float tempC     = 38.0f + 2.5f * sinf(sessionS / 19.0f);
  float humPct    = 42.0f + 3.0f * cosf(sessionS / 23.0f);
  int   rssi      = WiFi.RSSI();

  cPower  .setValue(power, 2);
  cEnergy .setValue(energy, 3);
  cCost   .setValue((int)(energy * 12.0f));            // ₹12/kWh (demo)
  cSess   .setValue((int)sessionM);
  cSoc    .setValue(socPct);
  cChargeG.setValue(power, 1);

  cV1     .setValue(voltage, 1);
  cI1     .setValue(current, 1);
  cPF     .setValue(pf, 3);
  cFreq   .setValue(freq, 2);
  cQuota  .setValue(quota);
  cGreen  .setValue(greenMix);

  cTemp   .setValue(tempC, 1);
  cHumid  .setValue(humPct, 1);
  cRssi   .setValue(rssi);
  cHeap   .setValue((int)(ESP.getFreeHeap() / 1024));
  cUp     .setValue((int)sessionS);

  // Hero card narrative
  char heroBuf[80];
  snprintf(heroBuf, sizeof(heroBuf), "Charging · %.2f kW · %d%%", power, socPct);
  hero.setValue(heroBuf);

  // Push to time-series charts every 2 s
  if (now - chartT > 2000) {
    chartT = now;
    cTrend .chartPushXY(sessionS, power);
    cRssiCh.chartPushXY(sessionS, rssi);
  }

  // Occasional notifications so the toast UI is visible in screenshots
  if (now - notifyT > 25000) {
    notifyT = now;
    JouleDash.notify(joule::NotifyLevel::Info,
                     String("Energy delivered: ") + String(energy, 2) + " kWh", 4000);
  }
}
