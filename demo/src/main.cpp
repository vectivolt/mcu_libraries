// ---------------------------------------------------------------------------
// VectiSuite for ESP32 / ESP8266 — VectiOTA · VectiSerial · VectiNet · VectiDash
// Author: VectiVolt team
// (c) 2026 VectiVolt — Apache-2.0 License
// ---------------------------------------------------------------------------
//
// VectiSuite combined demo for ESP32-S3 N8R2.
//
// Spins up a polished, EV-charger-themed dashboard that exercises every
// widget type in VectiDash plus the OTA / Serial / Wi-Fi UIs at the same
// time. All four libraries share one AsyncWebServer instance.
//
//   /         → VectiDash (302 → /dash)
//   /dash     → VectiDash · 4 tabs of live energy / status / control widgets
//   /ota      → VectiOTA  · drag-drop firmware updater
//   /serial   → VectiSerial · wireless console
//   /wifi     → VectiNet  · provisioning portal + custom params
//
// Simulated telemetry is sized to look like a real 7.2 kW Level-2 AC
// charging session so the dashboard screenshot is meaningful, not toy.

#include <Arduino.h>
#include <WiFi.h>
#include <ESPAsyncWebServer.h>

#include <VectiOTA.h>
#include <VectiSerial.h>
#include <VectiNet.h>
#include <VectiDash.h>

#include <math.h>

// ---- defaults ----------------------------------------------------------
//
// Wi-Fi credentials are build flags, never literals in the source. A previous
// revision of this file carried a real SSID and its plaintext PSK, and that is
// exactly how a home network ends up in a git history that outlives it.
//
// Provide them at build time if you want the demo to auto-join:
//     pio run -e esp32s3-n8r2 \
//       --build-flag='-DDEMO_WIFI_SSID="my-ssid"' \
//       --build-flag='-DDEMO_WIFI_PASS="my-psk"'
//
// With no flags the demo boots straight into the VectiNet setup portal, which
// is the flow a first-time user should see anyway.
#ifndef DEMO_WIFI_SSID
  #define DEMO_WIFI_SSID ""
#endif
#ifndef DEMO_WIFI_PASS
  #define DEMO_WIFI_PASS ""
#endif

static constexpr const char *DEFAULT_SSID    = DEMO_WIFI_SSID;
static constexpr const char *DEFAULT_PASS    = DEMO_WIFI_PASS;
static constexpr const char *AP_FALLBACK_SSID= "Vecti-Demo";
static constexpr const char *HOSTNAME        = "vecti-demo";
static constexpr const char *FW_VERSION      = "1.0.0+demo";
// VectiVolt energy green. The UI's gradient companion (teal) is baked into the
// shared CSS, so cards, gauges, charts and tab pills all sit in one palette.
static constexpr const char *BRAND_HEX       = "#0fd08c";

AsyncWebServer server(80);

using vecti::DashCard;
using vecti::DashType;
using vecti::DashColor;

// ---- Overview tab — hero + live energy / session telemetry ----------------

DashCard hero    (DashType::Custom,      "hero",   "VectiSuite EV charger");
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


// ---- Widgets tab — one card per remaining DashType, so a hardware smoke test
// ---- exercises the whole catalogue rather than the handful the demo uses. ----
using vecti::DashType;
DashCard wHdr1 (DashType::Header,       "wh1",  "Readouts");
DashCard wText (DashType::Text,         "wtx",  "Build");
DashCard wBadge(DashType::Badge,        "wbg",  "Mode");
DashCard wLed  (DashType::Led,          "wld",  "Contactor");
DashCard wBatt (DashType::Battery,      "wbt",  "Pack",      "%");
DashCard wSig  (DashType::Signal,       "wsg",  "Wi-Fi",     "dBm");
DashCard wUp2  (DashType::Uptime,       "wup",  "Uptime");
DashCard wSpark(DashType::Sparkline,    "wsp",  "Trend");
DashCard wTable(DashType::Table,        "wtb",  "Device");
DashCard wLog  (DashType::LogView,      "wlg",  "Events");

DashCard wHdr2 (DashType::Header,       "wh2",  "Meters");
DashCard wDial (DashType::Dial,         "wdl",  "Dial",      "kW", 0, 22);
DashCard wBar  (DashType::Bar,          "wbr",  "Bar",       "%",  0, 100);
DashCard wLevel(DashType::Level,        "wlv",  "Tank",      "L",  0, 60);
DashCard wComp (DashType::Compass,      "wcp",  "Heading");
DashCard wTherm(DashType::Thermo,       "wth",  "Coolant",   "C", -10, 90);

DashCard wHdr3 (DashType::Header,       "wh3",  "Charts");
DashCard wMulti(DashType::MultiChart,   "wmc",  "3-phase current");
DashCard wHist (DashType::Histogram,    "whs",  "Hourly kWh");
DashCard wScat (DashType::Scatter,      "wsc",  "V vs I");
DashCard wHeat (DashType::Heatmap,      "whm",  "Cell temps");

DashCard wHdr4 (DashType::Header,       "wh4",  "Controls");
DashCard wConf (DashType::ConfirmButton,"wcf",  "Factory reset");
DashCard wMom  (DashType::Momentary,    "wmo",  "Jog motor");
DashCard wStep (DashType::Stepper,      "wst",  "Setpoint",  "A", 6, 32);
DashCard wRange(DashType::RangeSlider,  "wrg",  "Window",    "C", 0, 60);
DashCard wDrop (DashType::Dropdown,     "wdp",  "Profile");
DashCard wRadio(DashType::Radio,        "wrd",  "Phase");
DashCard wChk  (DashType::Checklist,    "wck",  "Protocols");
DashCard wKnob (DashType::Knob,         "wkn",  "Limit",     "A", 6, 32);
DashCard wXY   (DashType::XYPad,        "wxy",  "Pan / tilt");
DashCard wKeys (DashType::Keypad,       "wkp",  "PIN");
DashCard wArea (DashType::Textarea,     "wta",  "Site notes");
DashCard wPass (DashType::Password,     "wpw",  "MQTT password");
DashCard wDate (DashType::DateTime,     "wdt",  "Next service");
DashCard wQr   (DashType::QrCode,       "wqr",  "Join this AP");
DashCard wDiv  (DashType::Divider,      "wdv",  "end of catalogue");

static DashCard *const kWidgetTour[] = {
  &wHdr1,&wText,&wBadge,&wLed,&wBatt,&wSig,&wUp2,&wSpark,&wTable,&wLog,
  &wHdr2,&wDial,&wBar,&wLevel,&wComp,&wTherm,
  &wHdr3,&wMulti,&wHist,&wScat,&wHeat,
  &wHdr4,&wConf,&wMom,&wStep,&wRange,&wDrop,&wRadio,&wChk,&wKnob,&wXY,&wKeys,
  &wArea,&wPass,&wDate,&wQr,&wDiv,
};

// ---- helpers -----------------------------------------------------------

// Not every ESP board variant defines LED_BUILTIN — esp32dev and several
// bare modules do not. Pick a sane default so the demo builds across the whole
// family rather than only on dev kits that happen to declare one.
#ifndef LED_BUILTIN
  #define LED_BUILTIN 2
#endif

// Deferred reboot. Both the WebSocket command handler and the dashboard button
// callback run on the AsyncTCP task; calling delay() + ESP.restart() from there
// stalls every other socket on the device and tears the stack down underneath
// the frame that is still being processed. Set a deadline instead and let
// loop() do it from a context that owns the CPU.
static uint32_t gRebootAtMs = 0;
static void requestReboot(uint32_t inMs) { gRebootAtMs = millis() + inMs; if (!gRebootAtMs) gRebootAtMs = 1; }
static void serviceReboot() {
  if (gRebootAtMs && (int32_t)(millis() - gRebootAtMs) >= 0) ESP.restart();
}

static void seedDefaultWiFiIfEmpty() {
  // No build-time credentials: leave whatever the operator provisioned through
  // the portal alone. The old version wiped every saved network that didn't
  // match a hard-coded SSID, so flashing the demo de-provisioned the device.
  if (DEFAULT_SSID[0] == '\0') return;

  for (auto &n : VectiNet.savedNetworks()) if (n.ssid == DEFAULT_SSID) return;
  VectiSerial.inf("Seeding build-time Wi-Fi '%s'", DEFAULT_SSID);
  VectiNet.saveCredentials(DEFAULT_SSID, DEFAULT_PASS);
}

static void setupNet() {
  VectiNet.setApCredentials(AP_FALLBACK_SSID, "");
  VectiNet.setHostname(HOSTNAME);
  VectiNet.setMdnsName(HOSTNAME);
  VectiNet.setPortalTimeoutMs(0);
  VectiNet.setConnectTimeoutMs(20000);
  VectiNet.setReprovisionMs(120000);
  VectiNet.setBrandColor(BRAND_HEX);
  VectiNet.setTitle("VectiSuite Setup");

  // Custom parameters covering every supported type.
  VectiNet.addParameter({"sec1",    "Application",  vecti::NetParamType::Header,  "","","",0,0});
  VectiNet.addParameter({"name",    "Charger name", vecti::NetParamType::Text,    "Bay 3 · VectiSuite Demo","display name","",0,0});
  VectiNet.addParameter({"mqtt_h",  "MQTT host",    vecti::NetParamType::Text,    "broker.local","fqdn or ip","",0,0});
  VectiNet.addParameter({"mqtt_p",  "MQTT port",    vecti::NetParamType::Number,  "1883","","",1,65535});
  VectiNet.addParameter({"mqtt_pw", "MQTT password",vecti::NetParamType::Password,"","","",0,0});
  VectiNet.addParameter({"region",  "Region",       vecti::NetParamType::Dropdown,"IN","","EU|US|APAC|IN|other",0,0});
  VectiNet.addParameter({"accent",  "Accent colour",vecti::NetParamType::Color,   BRAND_HEX,"","",0,0});
  VectiNet.addParameter({"verbose", "Verbose logs", vecti::NetParamType::Toggle,  "1","","",0,0});
  VectiNet.addParameter({"sec2",    "Notes",        vecti::NetParamType::Divider, "","","",0,0});
  VectiNet.addParameter({"notes",   "Site notes",   vecti::NetParamType::Textarea,
                         "Bay 3, ground floor.\nMounted on west pillar.\nKey under reception.","free-form","",0,0});

  VectiNet.begin(&server);
  seedDefaultWiFiIfEmpty();

  VectiNet.onState([](vecti::NetState s){
    const char *names[] = {"idle","connecting","connected","portal","failed"};
    VectiSerial.inf("netState=%s", names[(int)s]);
    if (s == vecti::NetState::Connected) {
      VectiDash.notify(vecti::NotifyLevel::Success,
        String("Connected: ") + WiFi.SSID() + " · " + WiFi.localIP().toString());
    }
  });
}

static void setupOta() {
  VectiOTA.setID(WiFi.macAddress());
  VectiOTA.setFWVersion(FW_VERSION);
  VectiOTA.setTitle("VectiSuite OTA");
  VectiOTA.setBrandColor(BRAND_HEX);
  VectiOTA.setRateLimitMs(2000);

  VectiOTA.onProgress([](size_t cur, size_t tot){
    static int last = -5;
    int pct = tot ? (int)((cur * 100) / tot) : 0;
    if (pct >= last + 5) { last = pct; VectiSerial.dbg("OTA %d%%", pct); }
  });
  VectiOTA.onEnd([](bool ok, const String &m){
    VectiSerial.inf("OTA end ok=%d msg=%s", ok, m.c_str());
    VectiDash.notify(ok ? vecti::NotifyLevel::Success : vecti::NotifyLevel::Error,
                     ok ? "Update complete — rebooting" : (String("Update failed: ") + m));
  });

  VectiOTA.begin(&server, "", "");        // demo: no auth (see README)

  // Mark the running image good only after the device has actually proven it
  // works. Calling commit() unconditionally here would cancel the rollback
  // watchdog on every boot, including a boot of freshly-flashed firmware that
  // is about to crash — which is precisely the case rollback exists to catch.
  // The real self-test is deferred to loop(): once Wi-Fi is up and the HTTP
  // server has served a request, the image has demonstrably survived.
}

static void setupSerial() {
  VectiSerial.setTitle("VectiSuite Console");
  VectiSerial.setBrandColor("#10b981");
  VectiSerial.setHistorySize(512);
  VectiSerial.onMessage([](const String &cmd){
    VectiSerial.inf("recv> %s", cmd.c_str());
    if      (cmd == "reboot")     { VectiSerial.wrn("rebooting in 1s"); requestReboot(1000); }
    else if (cmd == "scan")       { WiFi.scanNetworks(true); VectiSerial.inf("scan started"); }
    else if (cmd == "heap")       { VectiSerial.inf("heap = %u bytes", ESP.getFreeHeap()); }
    else if (cmd == "wipe-wifi")  { VectiNet.clearAllCredentials(); VectiSerial.wrn("WiFi creds wiped"); }
    else if (cmd.startsWith("notify ")) VectiDash.notify(vecti::NotifyLevel::Info, cmd.substring(7));
    else VectiSerial.dbg("unknown '%s' — try: reboot scan heap wipe-wifi 'notify <msg>'", cmd.c_str());
  });
  VectiSerial.begin(&server, "", "");
}

static void setupDash() {
  VectiDash.setTitle("VectiSuite EV Charger");
  VectiDash.setBrandColor(BRAND_HEX);
  VectiDash.setTheme("auto");
  VectiDash.addTab("Overview");
  VectiDash.addTab("Energy");
  VectiDash.addTab("Controls");
  VectiDash.addTab("Diagnostics");
  VectiDash.addTab("Widgets");

  // ---- Overview --------------------------------------------------------
  hero.setTab("Overview"); hero.setWidth(12);
  hero.setCustomHtml(
    "<div style='display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:6px 4px'>"
      "<div style='width:64px;height:64px;border-radius:16px;display:grid;place-items:center;"
          "background:var(--grad);box-shadow:0 10px 30px color-mix(in srgb,var(--brand) 35%,transparent);"
          "font-size:30px;color:#fff'>⚡</div>"
      "<div style='flex:1;min-width:220px'>"
        "<div style='font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);font-weight:700'>"
          "Bay 3 · VectiSuite Demo</div>"
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
    VectiDash.notify(on ? vecti::NotifyLevel::Success : vecti::NotifyLevel::Info,
                     on ? "Session started" : "Session stopped");
  });
  cLimit .onChange([](const String &v){ VectiSerial.inf("current limit → %sA", v.c_str()); });
  cMode  .onChange([](const String &v){
    const char *names[]={"Standard","Eco","Boost","Solar"};
    int n = constrain(v.toInt(), 0, 3);
    VectiSerial.inf("mode → %s", names[n]);
    VectiDash.notify(vecti::NotifyLevel::Info, String("Mode: ") + names[n]);
  });
  cLed   .onChange([](const String &v){
    VectiSerial.inf("LED ring → %s", v.c_str());
    VectiDash.setBrandColor(v);
    VectiDash.refreshLayout();
  });
  cStop  .onChange([](const String &){
    VectiDash.notify(vecti::NotifyLevel::Error, "Emergency STOP triggered");
    VectiSerial.err("E-STOP");
  });
  cReboot.onChange([](const String &){
    VectiDash.notify(vecti::NotifyLevel::Warn, "Rebooting in 1s…", 1000);
    requestReboot(1100);
  });
  cTag   .onChange([](const String &v){
    VectiSerial.inf("Driver tag: %s", v.c_str());
    VectiDash.notify(vecti::NotifyLevel::Success, String("RFID: ") + v + " · authorized");
  });

  // ---- Register every card ---------------------------------------------
  VectiDash.add(&hero);
  VectiDash.add(&cPower); VectiDash.add(&cEnergy); VectiDash.add(&cCost); VectiDash.add(&cSess);
  VectiDash.add(&cState); VectiDash.add(&cSoc);    VectiDash.add(&cChargeG);
  VectiDash.add(&cV1);    VectiDash.add(&cI1);     VectiDash.add(&cPF);   VectiDash.add(&cFreq);
  VectiDash.add(&cQuota); VectiDash.add(&cGreen);  VectiDash.add(&cTrend);
  VectiDash.add(&cStart); VectiDash.add(&cLimit);  VectiDash.add(&cMode); VectiDash.add(&cLed);
  VectiDash.add(&cStop);  VectiDash.add(&cReboot); VectiDash.add(&cJoy);  VectiDash.add(&cTag);
  VectiDash.add(&cTemp);  VectiDash.add(&cHumid);  VectiDash.add(&cRssi); VectiDash.add(&cHeap);
  VectiDash.add(&cUp);    VectiDash.add(&cNet);    VectiDash.add(&cOcpp); VectiDash.add(&cRssiCh);


  // ---- Widgets tour -----------------------------------------------------
  for (auto *c : kWidgetTour) { c->setTab("Widgets"); VectiDash.add(c); }
  wHdr1.setWidth(12); wHdr2.setWidth(12); wHdr3.setWidth(12); wHdr4.setWidth(12); wDiv.setWidth(12);
  wTable.setWidth(6); wLog.setWidth(6); wMulti.setWidth(12);
  wHist.setWidth(6);  wScat.setWidth(6); wHeat.setWidth(6); wArea.setWidth(6); wQr.setWidth(4);
  wConf.setColor(vecti::DashColor::Danger);
  wDrop .setOptions("Eco|Standard|Boost");
  wRadio.setOptions("L1|L2|L3");
  wChk  .setOptions("OCPP|MQTT|Modbus");
  wText .setValue(FW_VERSION);
  wBadge.setValue("Boost");        wBadge.setColor(vecti::DashColor::Info);
  wStep .setValue(16);  wKnob.setValue(16);  wRange.setValue("18,42");
  wDrop .setValue("Standard");     wRadio.setValue("L1");  wChk.setValue("OCPP|MQTT");
  wXY   .setValue("50,50");
  wArea .setValue("Bay 3, ground floor.\nWest pillar.");
  wTable.setValue("[[\"Chip\",\"ESP32-S3\"],[\"Flash\",\"8 MB\"],[\"PSRAM\",\"2 MB\"]]");
  wLog  .setValue("[\"boot ok\",\"wifi up\",\"dash ready\"]");
  // Scanning this joins the device's own AP — the onboarding path no
  // competitor in this space ships.
  wQr   .setValue(String("WIFI:S:") + AP_FALLBACK_SSID + ";T:nopass;;");

  VectiDash.begin(&server, "", "", /*allowAnonymousRead=*/true);
}

void setup() {
  Serial.begin(115200);
  delay(300); Serial.println("\n== VectiSuite demo ==");

  setupNet();
  setupSerial();
  setupOta();
  setupDash();

  server.begin();
  VectiSerial.inf("HTTP server up — routes: / /dash /ota /serial /wifi");
  VectiSerial.inf("mDNS: http://%s.local", HOSTNAME);
  VectiNet.autoConnect();

  // Seed Energy + RSSI charts with a plausible warm-up curve so the first
  // viewer of the dashboard sees something interesting immediately.
  for (int i = 0; i < 30; i++) {
    float t = i;
    cTrend  .chartPushXY(t, 7.0f + 0.3f * sinf(i / 4.0f));
    cRssiCh .chartPushXY(t, -70 + 8 * sinf(i / 5.0f));
  }
}

void loop() {
  VectiNet.loop();
  VectiOTA.loop();
  VectiSerial.loop();
  VectiDash.tick();
  serviceReboot();

  static uint32_t last = 0, startMs = millis(), chartT = 0, notifyT = millis();
  uint32_t now = millis();

  // Self-test for the rollback watchdog: 20 s of uptime with an associated
  // radio means this image boots, joins, and serves. Only then is it worth
  // marking valid — before that, a crash should hand the device back to the
  // previous slot.
  static bool committed = false;
  if (!committed && (now - startMs) > 20000 && WiFi.status() == WL_CONNECTED) {
    committed = true;
    VectiOTA.commit();
    VectiSerial.inf("self-test passed — firmware slot marked valid");
  }

  if (now - last < 1000) return;
  last = now;

  // Heartbeat to the hardware UART once a minute. A soak test needs a heap
  // series it can regress against, and the dashboard card only exists while a
  // browser is attached — which is exactly the condition you are NOT testing
  // when you leave a device running overnight on a bench.
  static uint32_t hbT = 0;
  static uint32_t heapAtStart = 0;
  if (!heapAtStart) heapAtStart = ESP.getFreeHeap();
  if (now - hbT >= 60000) {
    hbT = now;
    uint32_t h = ESP.getFreeHeap();
    VectiSerial.inf("heartbeat up=%lus heap=%u min=%u drift=%ld rssi=%d state=%d",
                    (unsigned long)(now / 1000), (unsigned)h,
                    (unsigned)ESP.getMinFreeHeap(),
                    (long)h - (long)heapAtStart,
                    WiFi.RSSI(), (int)VectiNet.getState());
  }

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
    VectiDash.notify(vecti::NotifyLevel::Info,
                     String("Energy delivered: ") + String(energy, 2) + " kWh", 4000);
  }
}
