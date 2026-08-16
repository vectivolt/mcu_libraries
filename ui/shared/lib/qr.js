/* ---------------------------------------------------------------------------
 * VectiSuite — QR Code encoder (ISO/IEC 18004), byte mode.
 *
 * Written from the spec rather than pulled from npm because this ships inside
 * an ESP32's flash next to the app it draws. The smallest maintained QR
 * package is ~12 KB min; this is a fraction of that because it does exactly
 * one job: encode a short UTF-8 string — a `WIFI:` join string or a
 * `http://192.168.4.1/…` URL — at versions 1..10.
 *
 * Deliberately NOT supported, because the payloads above never need them:
 *   - numeric / alphanumeric / kanji modes (byte mode encodes anything; it is
 *     only ~15% larger on a digits-only payload, and these are never digits)
 *   - versions 11..40 (v10-L already holds 271 bytes)
 *   - ECI headers, structured append, micro QR
 * Anything that does not fit returns null. A caller that renders null as an
 * error is correct; a caller that renders a truncated symbol is not, which is
 * why this never truncates.
 *
 * (c) 2026 VectiVolt — MIT License
 * ------------------------------------------------------------------------- */

/* Table 1: total codewords (data + ECC) per version, indexed 1..10. */
const TOTAL_CW = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/* Table 2: ECC codewords per block, and block count, per version and level.
 * Straight out of ISO/IEC 18004 Table 9. Data codewords are derived:
 * TOTAL_CW[v] - ECW[lvl][v] * BLOCKS[lvl][v], so there is no third table to
 * fall out of sync with the first two. */
const ECW = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};
/* Level indicator bits used in the format information. Note these are NOT in
 * L<Q<M<H strength order — the numbering is the spec's, not a ranking. */
const ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/* ---- GF(256), primitive polynomial x^8+x^4+x^3+x^2+1 (0x11D) ------------ */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
/* EXP is doubled so the log sum (max 508) never needs a modulo. */
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Reed-Solomon remainder of `data` for `deg` ECC codewords. */
function rsEcc(data, deg) {
  // Generator polynomial (x-a^0)(x-a^1)…(x-a^(deg-1)), coefficients high-first.
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];                    // the x term shifts up a degree
      next[j + 1] ^= mul(g[j], EXP[i]);   // the a^i term stays
    }
    g = next;
  }
  // Long division, remainder kept in a shift register.
  const rem = new Uint8Array(deg);
  for (const b of data) {
    const f = b ^ rem[0];
    rem.copyWithin(0, 1);
    rem[deg - 1] = 0;
    for (let i = 0; i < deg; i++) rem[i] ^= mul(g[i + 1], f);
  }
  return rem;
}

/* ---- Data masks (Table 10). True = flip this module. -------------------- */
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (((y / 2) | 0) + ((x / 3) | 0)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/* The 1:1:3:1:1 finder-lookalike and its mirror, for penalty rule 3. */
const P3A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
const P3B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

/** Mask penalty score (Table 11). Lower is better. */
function penalty(m, n) {
  let p = 0;
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 2; d++) {
      const line = new Uint8Array(n);
      for (let j = 0; j < n; j++) line[j] = d ? m[j * n + i] : m[i * n + j];
      // Rule 1: runs of 5+ identical modules.
      let run = 1;
      for (let j = 1; j <= n; j++) {
        if (j < n && line[j] === line[j - 1]) run++;
        else {
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
      // Rule 3: finder-lookalike anywhere in the line.
      for (let j = 0; j + 11 <= n; j++) {
        let a = 1, b = 1;
        for (let k = 0; k < 11; k++) {
          if (line[j + k] !== P3A[k]) a = 0;
          if (line[j + k] !== P3B[k]) b = 0;
        }
        p += (a + b) * 40;
      }
    }
  }
  // Rule 2: solid 2x2 blocks.
  for (let y = 0; y + 1 < n; y++) {
    for (let x = 0; x + 1 < n; x++) {
      const v = m[y * n + x];
      if (v === m[y * n + x + 1] && v === m[(y + 1) * n + x] && v === m[(y + 1) * n + x + 1]) p += 3;
    }
  }
  // Rule 4: deviation of dark-module share from 50%, in 5% steps.
  let dark = 0;
  for (let i = 0; i < n * n; i++) dark += m[i];
  const N = n * n;
  return p + 10 * Math.floor(Math.abs(dark * 20 - N * 10) / N);
}

/**
 * Encode `text` as a QR symbol.
 *
 * @param {string} text  payload, encoded as UTF-8 in byte mode
 * @param {"L"|"M"|"Q"|"H"} ecc  error correction level, default M
 * @returns {{size:number, modules:Uint8Array}|null}
 *   `modules` is row-major, one byte per module, 1 = dark. null when the
 *   payload does not fit version 10 at the requested level.
 */
export function encodeQR(text, ecc = "M") {
  const lvl = ECW[ecc] ? ecc : "M";
  const data = new TextEncoder().encode(String(text ?? ""));
  if (!data.length) return null;

  // ---- Pick the smallest version that fits ------------------------------
  let ver = 0, dataCw = 0;
  for (let v = 1; v <= 10; v++) {
    const cw = TOTAL_CW[v] - ECW[lvl][v] * BLOCKS[lvl][v];
    // 4 mode bits + character count (8 bits below v10, 16 from v10) + payload.
    if (4 + (v < 10 ? 8 : 16) + data.length * 8 <= cw * 8) {
      ver = v;
      dataCw = cw;
      break;
    }
  }
  if (!ver) return null;

  // ---- Bit stream: header, payload, terminator, pad -----------------------
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4);
  push(data.length, ver < 10 ? 8 : 16);
  for (const b of data) push(b, 8);
  push(0, Math.min(4, dataCw * 8 - bits.length)); // terminator, truncated if tight
  while (bits.length % 8) bits.push(0);

  const cw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  // Pad codewords alternate 11101100 / 00010001 per the spec.
  for (let i = 0; cw.length < dataCw; i++) cw.push(i % 2 ? 0x11 : 0xec);

  // ---- Split into blocks, add ECC, interleave -----------------------------
  const nb = BLOCKS[lvl][ver], ecLen = ECW[lvl][ver];
  const shortLen = Math.floor(dataCw / nb), nShort = nb - (dataCw % nb);
  const dBlocks = [], eBlocks = [];
  for (let i = 0, off = 0; i < nb; i++) {
    const len = shortLen + (i < nShort ? 0 : 1);
    const d = cw.slice(off, off + len);
    off += len;
    dBlocks.push(d);
    eBlocks.push(rsEcc(d, ecLen));
  }
  const out = [];
  for (let i = 0; i <= shortLen; i++) for (const d of dBlocks) if (i < d.length) out.push(d[i]);
  for (let i = 0; i < ecLen; i++) for (const e of eBlocks) out.push(e[i]);

  // ---- Function patterns --------------------------------------------------
  const n = ver * 4 + 17;
  const m = new Uint8Array(n * n); // 1 = dark
  const fn = new Uint8Array(n * n); // 1 = function pattern, not data
  const set = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    m[y * n + x] = dark ? 1 : 0;
    fn[y * n + x] = 1;
  };

  // Finders + separators: concentric rings around each centre. Ring 2 (light)
  // and ring 4 (the separator) are the only light ones.
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const r = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, r !== 2 && r !== 4);
      }
    }
  }
  // Timing patterns. Only the stretch between the separators is unclaimed.
  for (let i = 8; i < n - 8; i++) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }
  // Alignment patterns. For v2..10 the centres are 6, the last column, and —
  // from v7 — their midpoint. (That midpoint shortcut is only exact through
  // v10; past that the spec's spacing table is genuinely irregular.)
  const last = 4 * ver + 10;
  const al = ver === 1 ? [] : ver < 7 ? [6, last] : [6, (6 + last) / 2, last];
  for (const cy of al) {
    for (const cx of al) {
      // The three corners are already finder patterns.
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === last) || (cx === last && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  // Reserve the two format-information strips. Skipping index 6 keeps the
  // timing modules that pass through them intact.
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { set(i, 8, 0); set(8, i, 0); }
  }
  for (let i = 0; i < 8; i++) set(n - 1 - i, 8, 0);
  for (let i = 0; i < 7; i++) set(8, n - 1 - i, 0);
  set(8, n - 8, 1); // the mandatory dark module, at (8, 4*ver+9)

  // Version information, v7+: 6 data bits + 12 BCH(18,6) bits, twice.
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
    const vb = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = (vb >> i) & 1, a = (i / 3) | 0, b = i % 3;
      set(n - 11 + b, a, bit); // top-right block
      set(a, n - 11 + b, bit); // bottom-left block, transposed
    }
  }

  // ---- Data placement: two-module columns, boustrophedon, bottom-right up --
  let idx = 0, up = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is not a data column
    for (let v = 0; v < n; v++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = up ? n - 1 - v : v;
        if (fn[y * n + x]) continue;
        // Past the end of the stream are the version's remainder bits: light.
        m[y * n + x] = idx < out.length * 8 ? (out[idx >> 3] >> (7 - (idx & 7))) & 1 : 0;
        idx++;
      }
    }
    up = !up;
  }

  // ---- Mask selection -----------------------------------------------------
  // Format info is drawn before scoring because those modules are part of the
  // symbol the penalty rules see.
  const drawFormat = (mask) => {
    const fd = (ECC_BITS[lvl] << 3) | mask;
    let rem = fd;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    const b = (((fd << 10) | rem) ^ 0x5412) >>> 0;
    const bit = (i) => (b >> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, 1);
  };
  const applyMask = (mask) => {
    const f = MASKS[mask];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!fn[y * n + x] && f(x, y)) m[y * n + x] ^= 1;
      }
    }
  };

  let best = 0, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask);
    drawFormat(mask);
    const s = penalty(m, n);
    if (s < bestScore) { bestScore = s; best = mask; }
    applyMask(mask); // XOR is its own inverse — undo before the next candidate
  }
  applyMask(best);
  drawFormat(best);

  return { size: n, modules: m };
}
