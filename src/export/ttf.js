// Reading TrueType fonts just enough to embed them in a PDF: character -> glyph lookup, advance widths,
// the metrics a PDF font descriptor needs, and a subset that keeps only the glyphs a CV uses (glyph ids
// stay the same, unused glyphs are emptied), so a CV PDF stays small.

export function parseTTF(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = v.getUint16(4);
  const tables = {};
  for (let i = 0; i < n; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    tables[tag] = { offset: v.getUint32(p + 8), length: v.getUint32(p + 12) };
  }
  const t = (tag) => { if (!tables[tag]) throw new Error(`Font has no ${tag} table`); return tables[tag].offset; };
  const head = t('head'), hhea = t('hhea'), maxp = t('maxp'), hmtx = t('hmtx');
  const unitsPerEm = v.getUint16(head + 18);
  const bbox = [v.getInt16(head + 36), v.getInt16(head + 38), v.getInt16(head + 40), v.getInt16(head + 42)];
  const indexToLocFormat = v.getInt16(head + 50);
  const macStyle = v.getUint16(head + 44);
  const ascender = v.getInt16(hhea + 4), descender = v.getInt16(hhea + 6);
  const numHMetrics = v.getUint16(hhea + 34);
  const numGlyphs = v.getUint16(maxp + 4);
  const advances = new Uint16Array(numGlyphs);
  for (let g = 0; g < numGlyphs; g++) advances[g] = v.getUint16(hmtx + 4 * Math.min(g, numHMetrics - 1));
  let capHeight = Math.round(ascender * 0.7), italicAngle = 0, weightClass = 400;
  if (tables['OS/2']) {
    const o = tables['OS/2'].offset;
    weightClass = v.getUint16(o + 4);
    if (v.getUint16(o) >= 2 && tables['OS/2'].length >= 90) capHeight = v.getInt16(o + 88) || capHeight;
  }
  if (tables.post) italicAngle = v.getInt32(tables.post.offset + 4) / 65536;

  // cmap: prefer the full Unicode table (format 12), else the BMP one (format 4).
  const cmapOff = t('cmap');
  const nSub = v.getUint16(cmapOff + 2);
  let sub4 = -1, sub12 = -1;
  for (let i = 0; i < nSub; i++) {
    const pid = v.getUint16(cmapOff + 4 + i * 8), eid = v.getUint16(cmapOff + 6 + i * 8), off = v.getUint32(cmapOff + 8 + i * 8);
    const fmt = v.getUint16(cmapOff + off);
    if (fmt === 12 && (pid === 3 || pid === 0)) sub12 = cmapOff + off;
    if (fmt === 4 && ((pid === 3 && eid === 1) || pid === 0)) sub4 = cmapOff + off;
  }
  const cache = new Map();
  function glyph(cp) {
    if (cache.has(cp)) return cache.get(cp);
    let g = 0;
    if (sub12 >= 0) {
      const groups = v.getUint32(sub12 + 12);
      let lo = 0, hi = groups - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1, p = sub12 + 16 + mid * 12;
        const s = v.getUint32(p), e = v.getUint32(p + 4);
        if (cp < s) hi = mid - 1; else if (cp > e) lo = mid + 1; else { g = v.getUint32(p + 8) + (cp - s); break; }
      }
    } else if (sub4 >= 0 && cp <= 0xffff) {
      const segX2 = v.getUint16(sub4 + 6);
      const ends = sub4 + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let i = 0; i < segX2 / 2; i++) {
        if (v.getUint16(ends + i * 2) < cp) continue;
        const s = v.getUint16(starts + i * 2);
        if (s > cp) break;
        const delta = v.getInt16(deltas + i * 2), ro = v.getUint16(ranges + i * 2);
        if (ro === 0) g = (cp + delta) & 0xffff;
        else { const gp = ranges + i * 2 + ro + (cp - s) * 2; const raw = v.getUint16(gp); g = raw ? (raw + delta) & 0xffff : 0; }
        break;
      }
    }
    cache.set(cp, g);
    return g;
  }

  let postscriptName = 'Font';
  if (tables.name) {
    const o = tables.name.offset, count = v.getUint16(o + 2), strOff = o + v.getUint16(o + 4);
    for (let i = 0; i < count; i++) {
      const r = o + 6 + i * 12;
      if (v.getUint16(r + 6) !== 6) continue;
      const pid = v.getUint16(r), len = v.getUint16(r + 8), off = v.getUint16(r + 10);
      const bytes = b.subarray(strOff + off, strOff + off + len);
      postscriptName = pid === 3 || pid === 0 ? String.fromCharCode(...Array.from({ length: len / 2 }, (_, k) => (bytes[2 * k] << 8) | bytes[2 * k + 1])) : String.fromCharCode(...bytes);
      if (pid === 3) break;
    }
  }
  return {
    bytes: b, tables, unitsPerEm, bbox, ascender, descender, capHeight, italicAngle, numGlyphs, advances, indexToLocFormat, glyph,
    postscriptName: postscriptName.replace(/[^\x21-\x7e]/g, '').replace(/[()<>[\]{}/%#]/g, '') || 'Font',
    bold: weightClass >= 600 || !!(macStyle & 1), italic: !!(macStyle & 2) || italicAngle !== 0,
  };
}

/** A copy of the font with every glyph not in `used` (a Set of glyph ids) emptied. */
export function subsetTTF(font, used) {
  const b = font.bytes;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const { tables, numGlyphs } = font;
  const locaOff = tables.loca.offset, glyfOff = tables.glyf.offset;
  const loca = (g) => (font.indexToLocFormat ? v.getUint32(locaOff + g * 4) : v.getUint16(locaOff + g * 2) * 2);
  // Composite glyphs (accented letters) pull in their parts.
  const keep = new Set([0, ...used]);
  const stack = [...keep];
  while (stack.length) {
    const g = stack.pop();
    if (g >= numGlyphs) continue;
    const s = loca(g), e = loca(g + 1);
    if (e <= s) continue;
    const p0 = glyfOff + s;
    if (v.getInt16(p0) >= 0) continue; // simple glyph
    let p = p0 + 10;
    for (;;) {
      const flags = v.getUint16(p), comp = v.getUint16(p + 2);
      if (!keep.has(comp)) { keep.add(comp); stack.push(comp); }
      p += 4 + (flags & 1 ? 4 : 2);
      if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
      if (!(flags & 0x20)) break;
    }
  }
  const pieces = [];
  const newLoca = new DataView(new ArrayBuffer((numGlyphs + 1) * 4));
  let size = 0;
  for (let g = 0; g < numGlyphs; g++) {
    newLoca.setUint32(g * 4, size);
    if (!keep.has(g)) continue;
    const s = loca(g), e = loca(g + 1);
    if (e > s) { const piece = b.subarray(glyfOff + s, glyfOff + e); pieces.push(piece); size += piece.length; if (size % 4) { const pad = 4 - (size % 4); pieces.push(new Uint8Array(pad)); size += pad; } }
  }
  newLoca.setUint32(numGlyphs * 4, size);
  const glyf = new Uint8Array(size);
  let o = 0;
  for (const p of pieces) { glyf.set(p, o); o += p.length; }

  const out = {};
  for (const tag of ['head', 'hhea', 'maxp', 'hmtx', 'cvt ', 'fpgm', 'prep', 'OS/2', 'post', 'name', 'cmap']) {
    if (tables[tag]) out[tag] = b.slice(tables[tag].offset, tables[tag].offset + tables[tag].length);
  }
  // post: drop glyph names (format 3) to save space.
  if (out.post) { const p = new Uint8Array(32); p.set(out.post.subarray(0, 32)); new DataView(p.buffer).setUint32(0, 0x00030000); out.post = p; }
  const head = new DataView(out.head.buffer);
  head.setInt16(50, 1);          // long loca
  head.setUint32(8, 0);          // checksum adjustment, recomputed below
  out.loca = new Uint8Array(newLoca.buffer);
  out.glyf = glyf;
  return writeSfnt(out);
}

function checksum(bytes) {
  const padded = bytes.length % 4 ? (() => { const p = new Uint8Array(bytes.length + 4 - (bytes.length % 4)); p.set(bytes); return p; })() : bytes;
  const v = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  return sum;
}

function writeSfnt(tables) {
  const tags = Object.keys(tables).sort();
  const n = tags.length;
  let entrySelector = 0; while (1 << (entrySelector + 1) <= n) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  let offset = 12 + n * 16;
  const dir = new DataView(new ArrayBuffer(offset));
  dir.setUint32(0, 0x00010000); dir.setUint16(4, n); dir.setUint16(6, searchRange); dir.setUint16(8, entrySelector); dir.setUint16(10, n * 16 - searchRange);
  const layout = [];
  tags.forEach((tag, i) => {
    const data = tables[tag];
    const p = 12 + i * 16;
    for (let k = 0; k < 4; k++) dir.setUint8(p + k, tag.charCodeAt(k));
    dir.setUint32(p + 4, checksum(data)); dir.setUint32(p + 8, offset); dir.setUint32(p + 12, data.length);
    layout.push([offset, data]);
    offset += data.length + ((4 - (data.length % 4)) % 4);
  });
  const out = new Uint8Array(offset);
  out.set(new Uint8Array(dir.buffer), 0);
  for (const [o, data] of layout) out.set(data, o);
  const headIdx = tags.indexOf('head');
  if (headIdx >= 0) {
    const adj = (0xb1b0afba - checksum(out)) >>> 0;
    new DataView(out.buffer).setUint32(layout[headIdx][0] + 8, adj);
  }
  return out;
}
