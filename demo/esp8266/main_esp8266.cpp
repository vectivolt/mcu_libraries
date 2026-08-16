// ---------------------------------------------------------------------------
// VectiSuite — ESP8266 smoke build.
//
// VectiOTA is the only library in the suite with real ESP8266 support; the
// other three are ESP32-only today (VectiNet refuses to compile elsewhere by
// design rather than silently failing to persist anything). This sketch exists
// so that support is a build-tested claim rather than a manifest entry.
// (c) 2026 VectiVolt — Apache-2.0 License
// ---------------------------------------------------------------------------
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESPAsyncWebServer.h>
#include <VectiOTA.h>

AsyncWebServer server(80);

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  VectiOTA.setFWVersion("1.0.0+esp8266");
  VectiOTA.begin(&server, "admin", "change-me");
  server.begin();
}

void loop() { VectiOTA.loop(); }
