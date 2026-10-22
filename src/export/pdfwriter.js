// A small PDF writer: pages of drawing operators, embedded TrueType fonts (subset, Unicode-aware so text
// can be selected, searched and read by applicant tracking systems), JPEG images, web links, document
// info, and attached files (Quire attaches the CV's JSON so the PDF can be imported back exactly).

import { parseTTF, subsetTTF } from './ttf.js';
import { deflate } from '../lib/zip.js';

const enc = new TextEncoder();
const num = (x) => (Math.abs(x) < 1e-6 ? '0' : (+x.toFixed(3)).toString());
const hex4 = (n) => n.toString(16).padStart(4, '0');

/** A PDF text string: plain ASCII as (…), anything else as UTF-16 hex. */
export function pdfString(s) {
  s = String(s);
  if (/^[\x20-\x7e]*$/.test(s)) return '(' + s.replace(/[\\()]/g, (c) => '\\' + c) + ')';
  let out = '<FEFF';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp > 0xffff) { const c = cp - 0x10000; out += hex4(0xd800 + (c >> 10)) + hex4(0xdc00 + (c & 0x3ff)); } else out += hex4(cp);
  }
  return out + '>';
}

class Font {
  constructor(name, bytes) {
    this.name = name;
    this.ttf = parseTTF(bytes);
    this.used = new Map(); // gid -> unicode text
    this.real = new Set(); // glyphs drawn for their own character
  }
  /** Glyph ids for a string, recording them for the subset and the text layer. */
  encode(text) {
    const gids = [];
    for (const ch of text) {
      if (FALLBACK[ch] === '') continue;
      let g = this.ttf.glyph(ch.codePointAt(0));
      if (g) { this.used.set(g, ch); this.real.add(g); }
      else {
        // Not in the font: draw a stand-in, and let copying give the stand-in too (never another character).
        const sub = FALLBACK[ch] || '?';
        g = this.ttf.glyph(sub.codePointAt(0));
        if (!this.real.has(g)) this.used.set(g, sub);
      }
      gids.push(g);
    }
    return gids;
  }
  /** Width of a string in points at a size. */
  width(text, size) {
    let w = 0;
    for (const g of this.encode(text)) w += this.ttf.advances[g] || 0;
    return (w / this.ttf.unitsPerEm) * size;
  }
  hex(gids) { return '<' + gids.map(hex4).join('') + '>'; }
}
const FALLBACK = { '\u2011': '-', '\u2010': '-', '\u2212': '-', '\u00ad': '', '\u2009': ' ', '\u202f': ' ', '\u00a0': ' ', '\u2002': ' ', '\u2003': ' ' };

class Page {
  constructor(w, h) { this.w = w; this.h = h; this.ops = []; this.fonts = new Map(); this.images = new Map(); this.links = []; }
  fontRef(font) { if (!this.fonts.has(font)) this.fonts.set(font, 'F' + (this.fonts.size + 1)); return this.fonts.get(font); }
  imageRef(img) { if (!this.images.has(img)) this.images.set(img, 'I' + (this.images.size + 1)); return this.images.get(img); }
  /** Coloured text at a baseline (x, y in PDF points from bottom-left). */
  text(font, size, x, y, str, { color = [0, 0, 0], charSpace = 0, gids } = {}) {
    if (!str) return;
    const g = gids || font.encode(str);
    this.ops.push(`BT /${this.fontRef(font)} ${num(size)} Tf ${color.map((c) => num(c / 255)).join(' ')} rg ${num(charSpace)} Tc 1 0 0 1 ${num(x)} ${num(y)} Tm ${font.hex(g)} Tj ET`);
  }
  /**
   * One line of words in one style, as a single TJ: words go exactly where the browser put them, with real
   * spaces between, so text extraction (copy and paste, applicant tracking systems) reads it naturally.
   * words: [{ x, str }] in order along the baseline y.
   */
  textRun(font, size, y, words, { color = [0, 0, 0], charSpace = 0 } = {}) {
    if (!words.length) return;
    const parts = [];
    let pen = words[0].x;
    const unit = size / font.ttf.unitsPerEm;
    words.forEach((w, i) => {
      if (i > 0) {
        const adj = (w.x - pen) * 1000 / size;
        if (Math.abs(adj) > 0.05) parts.push(num(-adj));
        pen = w.x;
      }
      const str = i < words.length - 1 ? w.str + ' ' : w.str;
      const gids = font.encode(str);
      parts.push(font.hex(gids));
      for (const g of gids) pen += (font.ttf.advances[g] || 0) * unit + charSpace;
    });
    // Tc is part of the graphics state and outlives ET, so it's always set.
    const text = `BT /${this.fontRef(font)} ${num(size)} Tf ${color.map((c) => num(c / 255)).join(' ')} rg ${num(charSpace)} Tc 1 0 0 1 ${num(words[0].x)} ${num(y)} Tm [${parts.join(' ')}] TJ ET`;
    // Letter-spaced words would read as "S U M M A R Y" in some tools; say what they really say.
    this.ops.push(charSpace ? `/Span << /ActualText ${pdfString(words.map((w) => w.str).join(' '))} >> BDC ${text} EMC` : text);
  }
  rect(x, y, w, h, color, radius = 0) {
    this.ops.push(`${color.map((c) => num(c / 255)).join(' ')} rg ${roundRect(x, y, w, h, radius)} f`);
  }
  strokeRect(x, y, w, h, color, lineWidth, radius = 0) {
    this.ops.push(`${color.map((c) => num(c / 255)).join(' ')} RG ${num(lineWidth)} w ${roundRect(x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth, Math.max(0, radius - lineWidth / 2))} S`);
  }
  image(img, x, y, w, h, radius = 0) {
    const name = this.imageRef(img);
    const clip = radius > 0 ? `${roundRect(x, y, w, h, radius)} W n ` : '';
    this.ops.push(`q ${clip}${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /${name} Do Q`);
  }
  link(x, y, w, h, url) { this.links.push({ rect: [x, y, x + w, y + h], url }); }
}

function roundRect(x, y, w, h, r) {
  if (!r) return `${num(x)} ${num(y)} ${num(w)} ${num(h)} re`;
  r = Math.min(r, w / 2, h / 2);
  const k = r * 0.5523;
  const x2 = x + w, y2 = y + h;
  return [
    `${num(x + r)} ${num(y)} m`, `${num(x2 - r)} ${num(y)} l`, `${num(x2 - r + k)} ${num(y)} ${num(x2)} ${num(y + r - k)} ${num(x2)} ${num(y + r)} c`,
    `${num(x2)} ${num(y2 - r)} l`, `${num(x2)} ${num(y2 - r + k)} ${num(x2 - r + k)} ${num(y2)} ${num(x2 - r)} ${num(y2)} c`,
    `${num(x + r)} ${num(y2)} l`, `${num(x + r - k)} ${num(y2)} ${num(x)} ${num(y2 - r + k)} ${num(x)} ${num(y2 - r)} c`,
    `${num(x)} ${num(y + r)} l`, `${num(x)} ${num(y + r - k)} ${num(x + r - k)} ${num(y)} ${num(x + r)} ${num(y)} c h`,
  ].join(' ');
}

export class PdfWriter {
  constructor() { this.fonts = new Map(); this.pages = []; this.images = []; this.files = []; this.meta = {}; }
  font(key, bytes) { if (!this.fonts.has(key)) this.fonts.set(key, new Font(key, bytes)); return this.fonts.get(key); }
  page(w, h) { const p = new Page(w, h); this.pages.push(p); return p; }
  /** A JPEG (as bytes) with its pixel size. */
  jpeg(bytes, width, height) { const img = { bytes, width, height }; this.images.push(img); return img; }
  attach(name, bytes, mime = 'application/json', description = '') { this.files.push({ name, bytes, mime, description }); }
  info(meta) { Object.assign(this.meta, meta); }

  async save() {
    const objects = []; // index = object number - 1; entries are strings or {dict, stream}
    const add = (o) => { objects.push(o); return objects.length; };
    const ref = (n) => `${n} 0 R`;
    const reserve = () => add(null);
    const catalog = reserve(), pagesObj = reserve();

    // Fonts (subset after all pages are drawn, so every used glyph is known).
    const fontObj = new Map();
    let tagN = 0;
    for (const f of this.fonts.values()) {
      const t = f.ttf;
      const scale = 1000 / t.unitsPerEm;
      const tag = 'QUIR' + String.fromCharCode(65 + (tagN % 26)) + String.fromCharCode(65 + Math.floor(tagN / 26) % 26);
      tagN++;
      const base = `${tag}+${t.postscriptName}`;
      const sub = subsetTTF(t, new Set(f.used.keys()));
      const file = add({ dict: `/Length1 ${sub.length}`, stream: sub });
      const flags = 32 | (t.italic ? 64 : 0) | (/serif|lora|plex|caladea/i.test(t.postscriptName) && !/sans/i.test(t.postscriptName) ? 2 : 0);
      const desc = add(`<< /Type /FontDescriptor /FontName /${base} /Flags ${flags} /FontBBox [${t.bbox.map((x) => Math.round(x * scale)).join(' ')}] /ItalicAngle ${num(t.italicAngle)} /Ascent ${Math.round(t.ascender * scale)} /Descent ${Math.round(t.descender * scale)} /CapHeight ${Math.round(t.capHeight * scale)} /StemV ${t.bold ? 120 : 80} /FontFile2 ${ref(file)} >>`);
      const gids = [...f.used.keys()].sort((a, b) => a - b);
      const widths = gids.map((g) => `${g} [${Math.round(t.advances[g] * scale)}]`).join(' ');
      const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${ref(desc)} /W [${widths}] /DW ${Math.round(t.advances[0] * scale)} /CIDToGIDMap /Identity >>`);
      const toUni = add({ dict: '', stream: enc.encode(toUnicode(f.used)) });
      fontObj.set(f, add(`<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${ref(cid)}] /ToUnicode ${ref(toUni)} >>`));
    }
    const imgObj = new Map();
    for (const img of this.images) imgObj.set(img, add({ dict: `/Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, stream: img.bytes, raw: true }));

    const pageRefs = [];
    for (const p of this.pages) {
      const content = add({ dict: '', stream: enc.encode(p.ops.join('\n')) });
      const fonts = [...p.fonts].map(([f, n]) => `/${n} ${ref(fontObj.get(f))}`).join(' ');
      const imgs = [...p.images].map(([i, n]) => `/${n} ${ref(imgObj.get(i))}`).join(' ');
      const annots = p.links.map((l) => add(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(num).join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfString(safeUri(l.url))} >> >>`));
      pageRefs.push(add(`<< /Type /Page /Parent ${ref(pagesObj)} /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << /Font << ${fonts} >>${imgs ? ` /XObject << ${imgs} >>` : ''} /ProcSet [/PDF /Text /ImageC] >> /Contents ${ref(content)}${annots.length ? ` /Annots [${annots.map(ref).join(' ')}]` : ''} >>`));
    }
    objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageRefs.map(ref).join(' ')}] /Count ${pageRefs.length} >>`;

    const fileSpecs = [];
    for (const f of this.files) {
      const date = pdfDate(new Date());
      const ef = add({ dict: `/Type /EmbeddedFile /Subtype /${f.mime.replace('/', '#2F')} /Params << /Size ${f.bytes.length} /ModDate ${date} >>`, stream: f.bytes });
      fileSpecs.push([f.name, add(`<< /Type /Filespec /F ${pdfString(f.name)} /UF ${pdfString(f.name)} /EF << /F ${ref(ef)} /UF ${ref(ef)} >> /Desc ${pdfString(f.description || f.name)} /AFRelationship /Data >>`)]);
    }
    const names = fileSpecs.length ? ` /Names << /EmbeddedFiles << /Names [${fileSpecs.map(([n, r]) => `${pdfString(n)} ${ref(r)}`).join(' ')}] >> >> /AF [${fileSpecs.map(([, r]) => ref(r)).join(' ')}]` : '';
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${ref(pagesObj)}${names} /Lang ${pdfString(this.meta.lang || 'en-GB')} /ViewerPreferences << /DisplayDocTitle true >> >>`;
    const m = this.meta;
    const info = add(`<< ${['Title', 'Author', 'Subject', 'Keywords'].filter((k) => m[k.toLowerCase()]).map((k) => `/${k} ${pdfString(m[k.toLowerCase()])}`).join(' ')} /Creator (Quire) /Producer (Quire) /CreationDate ${pdfDate(new Date())} >>`);

    // Serialise.
    const chunks = [new Uint8Array([...enc.encode('%PDF-1.7\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 10])];
    let pos = chunks[0].length;
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pos);
      const o = objects[i];
      let parts;
      if (typeof o === 'string') parts = [enc.encode(`${i + 1} 0 obj\n${o}\nendobj\n`)];
      else {
        const data = o.raw ? o.stream : await deflate(o.stream);
        const filter = o.raw ? '' : ' /Filter /FlateDecode';
        parts = [enc.encode(`${i + 1} 0 obj\n<< ${o.dict}${filter} /Length ${data.length} >>\nstream\n`), data, enc.encode('\nendstream\nendobj\n')];
      }
      for (const p of parts) { chunks.push(p); pos += p.length; }
    }
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n')].join('');
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
    chunks.push(enc.encode(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${ref(catalog)} /Info ${ref(info)} /ID [<${id}> <${id}>] >>\nstartxref\n${pos}\n%%EOF\n`));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

function safeUri(url) {
  let u = String(url);
  try { u = decodeURI(u); } catch { /* already raw, or has a stray % */ }
  try { return encodeURI(u); } catch { return u.replace(/[^\x21-\x7e]/g, ''); }
}

function toUnicode(used) {
  const entries = [...used].sort((a, b) => a[0] - b[0]);
  const blocks = [];
  for (let i = 0; i < entries.length; i += 100) {
    const part = entries.slice(i, i + 100);
    blocks.push(`${part.length} beginbfchar\n${part.map(([g, ch]) => `<${hex4(g)}> <${[...ch].map((c) => { const cp = c.codePointAt(0); if (cp > 0xffff) { const x = cp - 0x10000; return hex4(0xd800 + (x >> 10)) + hex4(0xdc00 + (x & 0x3ff)); } return hex4(cp); }).join('')}>`).join('\n')}\nendbfchar`);
  }
  return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${blocks.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
}

function pdfDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `(D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z)`;
}
