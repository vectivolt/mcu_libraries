# VectiDash widget contract

Every widget is one `.svelte` file in `ui/shared/widgets/`, registered in `index.js`.
The dashboard shell (`ui/apps/dash/src/App.svelte`) owns the card chrome — border,
label, accent rail, grid span. A widget renders **only the body**.

## Props

```svelte
<script>
  let { card, value, cmd } = $props();
</script>
```

| prop | type | notes |
|---|---|---|
| `card` | object | the layout descriptor the firmware sent (see below) |
| `value` | string | **always a string on the wire.** Parse it yourself with `num()` |
| `cmd` | `(v) => void` | send a value back to the device. No-op for read-only widgets |

`card` fields, all present, from `DashCardBase::describe()` in `VectiDash.cpp`:

```
id, type, label, unit, color, tab, min, max, step, width, hidden, chartType, opts, custom, value
```

`opts` is a `|`-separated string (`"Eco|Standard|Boost"`) — the firmware's
`setOptions()`. Empty when unused.

## Rules

1. **Never trust `value`.** It is whatever the sketch passed to `setValue()`. Use
   `num(value, fallback)` from `$shared/lib/net.js` — plain `parseFloat(v) || min`
   is wrong because a legitimate `0` is falsy. Guard array/JSON parses in `try`.
2. **No layout ownership.** No margins outside your own box, no grid columns, no
   card padding. Use `margin-top: auto` to bottom-align a control the way the
   existing widgets do.
3. **Scoped `<style>` only.** Plain CSS with the theme tokens from
   `shared/theme.css` (`--color-brand`, `--color-ink`, `--color-muted`,
   `--color-line`, `--color-ok/warn/err/info`, `--radius-ctl`, `--font-mono`).
   No Tailwind — it is not in the build any more.
4. **Accessibility is not optional.** Every interactive control needs an
   accessible name (`aria-label={card.label || card.id}`). Anything conveying
   state needs it in text or ARIA, never colour alone. Meters get
   `role="img"` + `aria-label`, or `role="progressbar"` with `aria-valuenow`.
5. **Icons** come from `$shared/components/Icon.svelte` (`<Icon name="Zap" size={15}/>`),
   never from a dependency.
6. **Container queries** are available — `Card.svelte` sets `container-type: inline-size`,
   so `@container (max-width: 150px) { … }` adapts to the card, not the viewport.
7. **Weight matters.** This ships in an MCU's flash. No new dependencies, no
   canvas where SVG will do, no per-frame animation loops.

## Sending commands

```js
cmd(String(next));           // always stringify
```

The device echoes the value back to every client, so do **not** optimistically
mutate `value` — render from the prop and let the round trip drive the UI. The
exception is a drag interaction (slider, joystick, knob), where you may keep a
local "while dragging" value to stay smooth, and drop it once the echo lands.

## Registering

Add to `shared/widgets/index.js`:

```js
import Foo from "./Foo.svelte";
export const WIDGETS = { …, foo: Foo };
```

The key is the lowercase string that `typeName()` in `VectiDash.cpp` emits for
the matching `DashType` enumerator. Keep the three in sync: enum → `typeName()`
→ registry key.
