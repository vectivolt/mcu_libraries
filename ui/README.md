# JouleSuite UI · Svelte 5 source

Source for the four web UIs that ship inside the JouleSuite C++ libraries.
Each app is a self-contained **Svelte 5 + Tailwind v4 + bits-ui** SPA;
`vite build` inlines all CSS/JS into a single HTML file, and
`scripts/embed-progmem.js` gzips that file and writes it as a PROGMEM byte
array into the matching `libraries/Joule*/src/Joule*_ui_gz.h`. The C++
side serves the bytes directly with `Content-Encoding: gzip`.

```
ui/
├── package.json
├── shared/
│   ├── theme.css                ← Tailwind v4 tokens + dark/light themes
│   └── components/              ← Card.svelte, Value.svelte, StatusDot.svelte, Sparkline.svelte
├── apps/
│   ├── dash/                    ← JouleDash dashboard SPA
│   ├── ota/                     ← JouleOTA drag-drop updater SPA
│   ├── serial/                  ← JouleSerial wireless console SPA
│   └── net/                     ← JouleNet captive portal SPA
└── scripts/
    ├── build-all.js             ← runs vite build for every app
    └── embed-progmem.js         ← gzips dist HTML → PROGMEM .h files
```

## Build

```bash
cd ui
npm install
npm run build          # builds all four apps + embeds the gz blobs
```

After a successful build, the matching `libraries/Joule*/src/Joule*_ui_gz.h`
files are overwritten. Run `pio run` in the firmware project to pick the
new bytes up.

## Development

Each app has its own dev server with hot reload:

```bash
npm run dev:dash       # http://localhost:5173 — connects to the real ESP via the proxy
npm run dev:ota
npm run dev:serial
npm run dev:net
```

Set the proxy first (`PORT=5712 ESP_HOST=<device-ip> node ../../tools/preview_proxy.js`)
and Vite will pick the device's `/dash/ws`, `/wifi/status`, etc. via the
relative paths in the source.

## Size budget

| App         | raw HTML | gzipped | typical ESP RAM cost |
|-------------|---------:|--------:|---------------------:|
| JouleDash   |    79 KB |   26 KB | ~0 KB (PROGMEM, served straight from flash) |
| JouleOTA    |    82 KB |   27 KB | ~0 KB |
| JouleSerial |    83 KB |   27 KB | ~0 KB |
| JouleNet    |    91 KB |   28 KB | ~0 KB |

All four blobs live in flash (PROGMEM); RAM usage on the device is
unchanged regardless of UI complexity. The numbers grow whenever you add
widgets / icons — re-run `npm run build` to refresh.

## Design tokens

Defined in `shared/theme.css` via Tailwind v4 `@theme`. Indigo accent,
semantic-only status colors, neutral near-black dark base.

```css
--color-brand:   #6366f1;   /* indigo 500   — primary  */
--color-brand-2: #8b5cf6;   /* violet 500   — gradient companion */
--color-ok:      #10b981;
--color-warn:    #f59e0b;
--color-err:     #ef4444;
--color-info:    #06b6d4;
```

Each app's runtime title and accent colour are pushed live from the host
sketch via the WebSocket layout frame (dash) or the appropriate JSON
endpoint (`/ota/info`, `/wifi/status`, `/serial/ws` history frame).

## License

MIT — see [LICENSE](../LICENSE).

---

<sub>**Author:** Chinmoy Bhuyan · **Email:** dikibhuyan@gmail.com · **(c)** 2026 — MIT</sub>
