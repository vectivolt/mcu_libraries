/* ---------------------------------------------------------------------------
 * VectiDash — widget registry.
 *
 * Keys MUST match the strings `typeName()` emits in VectiDash.cpp. The three
 * places that have to agree are: the DashType enum, typeName(), and this map.
 * A key here with no enumerator is dead weight in flash; an enumerator with no
 * key here renders as the fallback card.
 *
 * (c) 2026 VectiVolt — Apache-2.0 License
 * ------------------------------------------------------------------------- */

// --- readouts ---
import Text       from "./Text.svelte";
import Badge      from "./Badge.svelte";
import Led        from "./Led.svelte";
import Battery    from "./Battery.svelte";
import Signal     from "./Signal.svelte";
import Uptime     from "./Uptime.svelte";
import Table      from "./Table.svelte";
import LogView    from "./LogView.svelte";
import Sparkline  from "./Sparkline.svelte";

// --- meters ---
import Dial       from "./Dial.svelte";
import Bar        from "./Bar.svelte";
import Level      from "./Level.svelte";
import Compass    from "./Compass.svelte";
import Thermo     from "./Thermo.svelte";

// --- charts ---
import MultiChart from "./MultiChart.svelte";
import Histogram  from "./Histogram.svelte";
import Scatter    from "./Scatter.svelte";
import Heatmap    from "./Heatmap.svelte";

// --- controls ---
import ConfirmButton from "./ConfirmButton.svelte";
import Momentary     from "./Momentary.svelte";
import RangeSlider   from "./RangeSlider.svelte";
import Stepper       from "./Stepper.svelte";
import Dropdown      from "./Dropdown.svelte";
import Radio         from "./Radio.svelte";
import Checklist     from "./Checklist.svelte";
import Textarea      from "./Textarea.svelte";
import Password      from "./Password.svelte";
import Keypad        from "./Keypad.svelte";
import XYPad         from "./XYPad.svelte";
import Knob          from "./Knob.svelte";
import DateTime      from "./DateTime.svelte";
import QrCode        from "./QrCode.svelte";

// --- layout ---
import Header     from "./Header.svelte";
import Divider    from "./Divider.svelte";

/**
 * type key -> component.
 *
 * The shell renders the classic types (number, gauge, switch, slider, chart,
 * status, progress, donut, image, input, joystick, color, button, custom,
 * temperature, humidity) inline, because they predate this registry and moving
 * them would churn the shell for no gain. Everything added since lives here.
 */
export const WIDGETS = {
  text: Text,
  badge: Badge,
  led: Led,
  battery: Battery,
  signal: Signal,
  uptime: Uptime,
  table: Table,
  logview: LogView,
  sparkline: Sparkline,

  dial: Dial,
  bar: Bar,
  level: Level,
  compass: Compass,
  thermo: Thermo,

  multichart: MultiChart,
  histogram: Histogram,
  scatter: Scatter,
  heatmap: Heatmap,

  confirm: ConfirmButton,
  momentary: Momentary,
  range: RangeSlider,
  stepper: Stepper,
  dropdown: Dropdown,
  radio: Radio,
  checklist: Checklist,
  textarea: Textarea,
  password: Password,
  keypad: Keypad,
  xypad: XYPad,
  knob: Knob,
  datetime: DateTime,
  qrcode: QrCode,

  header: Header,
  divider: Divider,
};

/** Layout-only widgets get no card chrome — no border, no label row. */
export const BARE = new Set(["header", "divider"]);
