# JouleSuite — Design System

A clean, professional design system for embedded device web UIs. Linear/Vercel-inspired neutral dark base with one cool indigo accent; semantic colors used only for status. All four JouleSuite UIs (Dashboard, Firmware Updater, Wireless Console, Wi-Fi Portal) share this system.

## Brand identity

* **Voice** — pragmatic, technical, confident. Like a developer-tool docs site, not a marketing splash page.
* **Tone in copy** — direct, lower-case where appropriate, no exclamation marks.
* **Logo treatment** — a single ⚡ glyph in a rounded-square (11px radius) tile, filled with the brand gradient (indigo → violet at 135°), white glyph.

## Colors

### Surfaces (dark — default)

| Token             | Hex          | Use |
|-------------------|--------------|-----|
| `bg`              | `#08090f`    | Page background |
| `bg-soft`         | `#0d0f17`    | Slight elevation under cards |
| `panel`           | `#11131c`    | Card surface |
| `panel-2`         | `#161824`    | Inline nested surfaces (toolbar pills, input fills) |
| `line`            | `rgb(255 255 255 / .06)` | Hairline borders |
| `line-soft`       | `rgb(255 255 255 / .04)` | Dashed dividers |
| `ink`             | `#f1f3fa`    | Primary text |
| `ink-2`           | `#b5bbd0`    | Secondary text |
| `muted`           | `#7a809a`    | Small caps labels, units, metadata |

### Surfaces (light)

| Token       | Hex / value |
|-------------|------------|
| `bg`        | `#f6f7fb` |
| `panel`     | `#ffffff` |
| `panel-2`   | `#f9fafc` |
| `line`      | `rgb(15 18 40 / .08)` |
| `ink`       | `#0b0d18` |
| `ink-2`     | `#42485c` |
| `muted`     | `#7d8398` |

### Brand

| Token       | Hex       | Use |
|-------------|-----------|-----|
| `brand`     | `#6366f1` | Primary buttons, active tabs, accent strokes |
| `brand-2`   | `#8b5cf6` | Gradient companion (same family) |

Gradient: `linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)`. Use the gradient for the logo tile, primary CTAs, and big numeric value fills. **Never** mix semantic colors into this gradient.

### Semantic (status only)

| Token | Hex       | Use |
|-------|-----------|-----|
| `ok`  | `#10b981` | Connected, healthy, success toast |
| `warn`| `#f59e0b` | Warning, pending, attention |
| `err` | `#ef4444` | Error, offline, dangerous action |
| `info`| `#06b6d4` | Informational toast, debug log level |

These are only used on pills, dots, log-level badges and toast borders — they never become the brand color.

### Background blur blobs

Behind the page, three soft radial gradients sit at fixed positions to give depth:

```css
background-image:
  radial-gradient(900px 600px at 12% -8%,  color-mix(in srgb, var(--brand)   22%, transparent), transparent 55%),
  radial-gradient(700px 480px at 92%  6%,  color-mix(in srgb, var(--brand-2) 18%, transparent), transparent 55%),
  radial-gradient(900px 700px at 50% 120%, color-mix(in srgb, var(--brand)    8%, transparent), transparent 60%);
```

## Typography

* **Sans** — `Inter` (fallback: SF Pro Display, system-ui).  Use `cv11, ss01, ss02` features. Hairline display weights 200–300 for large numeric KPIs.
* **Mono** — `JetBrains Mono` (fallback: SF Mono, Menlo, Consolas). Used for terminal logs, hex values, hardware IDs, IPs, timestamps.

| Role                  | Family | Weight | Size | Letter-spacing |
|-----------------------|--------|--------|------|----------------|
| Title (header)        | sans   | 600    | 15.5 px | -0.2 px |
| Subtitle (header)     | sans   | 500    | 11.5 px | 0.1 px |
| Section label (small caps) | sans | 600 | 11 px | 1 px, uppercase |
| KPI value (big)       | sans   | 300    | 32–48 px | -1 px |
| KPI value (small)     | sans   | 300    | 24–28 px | -0.6 px |
| Body                  | sans   | 400    | 14.5 px / 1.5 | 0 |
| Button                | sans   | 600    | 13.5 px | -0.1 px |
| Mono / code           | mono   | 500    | 12.5 px | 0 |

## Spacing

Base unit 4 px. Common sizes:

| Token | px |
|-------|----|
| `xs`  | 4  |
| `sm`  | 8  |
| `md`  | 12 |
| `lg`  | 16 |
| `xl`  | 20 |
| `2xl` | 28 |
| `3xl` | 40 |

Cards: 20 px inner padding. Compact toolbars: 8–12 px. Grid gap: 14 px desktop / 10 px mobile.

## Radii

| Token   | px |
|---------|----|
| `sm`    | 8  |
| `md`    | 10 |
| `pill`  | 99 |
| `card`  | 20 |
| `btn`   | 12 |
| `chip`  | 99 |

## Shadows

```
--shadow-card:        0 1px 0 rgb(255 255 255 / .04) inset,
                      0 24px 48px -16px rgb(0 0 0 / .55),
                      0 4px 12px -4px rgb(0 0 0 / .30);
--shadow-card-hover:  0 1px 0 rgb(255 255 255 / .06) inset,
                      0 30px 60px -18px rgb(99 102 241 / .35),
                      0 6px 16px -4px rgb(0 0 0 / .35);
--shadow-btn:         0 8px 24px -8px rgb(99 102 241 / .7),
                      inset 0 1px 0 rgb(255 255 255 / .2);
```

## Components

### Card

* Background `panel`, hairline border, radius 20 px.
* Top half overlaid with a 25 %-opacity white→transparent gradient for a soft sheen.
* Optional 3 px left accent strip in a semantic color (`success / warning / danger / info / primary`) when the card has a meaningful state.
* On hover: translateY(-2 px), brighten border to 30 % brand, switch to `shadow-card-hover`.

### Status dot

* 6 px circle, with a soft 4 px ring of the same color at 18 % opacity. Pulses for `ok` (animation 2.4 s ease-in-out).

### Pill / chip

* Pill radius, 1 px border, `panel-2` fill, monospace text with tabular numerics. Used for stats like "dbg 12", "rate 4/s", "online".

### Button

* Primary: brand gradient fill, white text, weight 600, `shadow-btn`. Hover lifts 2 px. Active resets translate.
* Ghost: `panel-2` fill, hairline border, `ink` text. On hover: border brightens to 50 % brand, text takes brand color.
* Danger: `err` → `#f87171` gradient. Same shadow recipe with `err` color.

### Toggle (switch)

* 48 × 28 px pill. Off: `ink` at 12 % opacity. On: brand gradient + `0 4px 14px -4px brand@70%` glow.
* Thumb: 20 × 20 px white circle, transitions with cubic-bezier(.34,1.56,.64,1).

### Slider

* 6 px track, brand gradient fill on the left of the thumb.
* 20 × 20 px thumb with 2 px white border and 8 px brand-tinted shadow.
* Live value bubble floats above thumb in brand color (mono, tabular-nums).

### KPI numeric

* Value in `text-3xl` (32 px) with weight 300 and `tabular-nums`. Unit suffix is `0.4em`, `muted` color, vertical-align baseline-up.

### Sparkline (inline, ~28 px tall)

* Single SVG path, brand color stroke, 1.6 px line width. Optional area fill with same color at 35 % → 0 % vertical gradient.

### Donut / Gauge

* Background ring stroke `line`. Foreground stroke uses a linear gradient (`brand` → `brand-2`). Transition `stroke-dasharray` 0.5 s ease.
* Center label in mono, weight 800, 22 px.

### Tab bar (pill)

* Horizontal scroll list. Active tab gets `bg = ink @ 6 %`, hairline border, font-weight 600. Inactive tabs are plain `muted` text on transparent background.

### Toast

* Top-right stacked. 12 px radius, `panel-2` fill, hairline border colored by level (info / ok / warn / err). 6 px wide left "bar" in the same level color. Slide-in from the right on appear.

## Iconography

Lucide. Stroke width 2.2 px. Sizes 14–18 px. Icons appear in primary CTAs and toolbars; never alone as identity.

## Motion

* Card hover lift: 250 ms `cubic-bezier(.3,.8,.2,1)`.
* Toggle thumb travel: 280 ms `cubic-bezier(.34,1.56,.64,1)`.
* Status-dot pulse: 2.4 s ease-in-out infinite.
* Toast slide-in: 250 ms `ease`.
* Progress ring fill: 500 ms `ease`.

## Layout

Mobile-first. Cards use a 12-column responsive grid that collapses to 6 columns ≤ 760 px and 2 columns ≤ 420 px.

Header is sticky with `backdrop-blur(20px) saturate(160%)` and an 80 % opaque `bg`.

Tab bar sits sticky right under the header, also blurred.

## Accessibility

* All interactive widgets carry an aria-label when the label is purely visual (icon-only).
* Touch targets ≥ 44 × 44 px.
* `prefers-color-scheme: light` automatically switches the theme tokens; user may pin a choice via the ◐ icon (`localStorage["joule-theme"]` = "dark" / "light" / "auto").

---

Author: Chinmoy Bhuyan · Email: dikibhuyan@gmail.com · © 2026 · MIT
