// The CV as a real PDF, drawn from the laid-out pages: every word goes exactly where the browser put it,
// in the same embedded font, so the PDF matches the preview. Text stays text (selectable, searchable,
// readable by applicant tracking systems), links work, and the CV's JSON rides along as an attachment so
// Quire can read the PDF back exactly.

import { PdfWriter } from './pdfwriter.js';
import { FONTS, familyFromCss, fontUrl } from '../render/fonts.js';
import { PAGE } from '../render/paginate.js';

const fontBytes = new Map();
async function loadFont(id, face) {
  const url = fontUrl(id, face);
  if (!fontBytes.has(url)) fontBytes.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('Could not load a font for the PDF.'); return r.arrayBuffer(); }).then((b) => new Uint8Array(b)));
  return fontBytes.get(url);
}

const faceOf = (cs) => {
  const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600;
  const italic = cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique');
  return bold ? (italic ? 'BoldItalic' : 'Bold') : italic ? 'Italic' : 'Regular';
};

function parseColor(c) {
  const m = String(c).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (!m) return null;
  let a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
  if (a === 0) return null;
  return { rgb: [+m[1], +m[2], +m[3]], a };
}
/** Blend a translucent colour onto white (CVs are printed on white). */
const solid = (c) => (c.a >= 1 ? c.rgb : c.rgb.map((x) => Math.round(255 - (255 - x) * c.a)));

/** Where the baseline sits in a line box of each face, as a fraction of its height (measured, not guessed). */
const baselineCache = new Map();
function baselineRatio(cs) {
  const key = `${cs.fontFamily}|${cs.fontWeight}|${cs.fontStyle}`;
  if (baselineCache.has(key)) return baselineCache.get(key);
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;left:-9999px;top:0;font-family:${cs.fontFamily};font-weight:${cs.fontWeight};font-style:${cs.fontStyle};font-size:100px;line-height:normal;white-space:nowrap`;
  const span = document.createElement('span');
  span.textContent = 'Hxg';
  const mark = document.createElement('span');
  mark.style.cssText = 'display:inline-block;width:1px;height:0;vertical-align:baseline';
  probe.append(span, mark);
  document.body.append(probe);
  const sr = span.getBoundingClientRect(), mr = mark.getBoundingClientRect();
  const ratio = (mr.bottom - sr.top) / sr.height;
  probe.remove();
  baselineCache.set(key, ratio);
  return ratio;
}

/** Text nodes in reading (DOM) order, skipping hidden ones. */
function* textNodes(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim()) yield n;
}

/** A JPEG of an <img> as it appears (object-fit: cover), at 2x its size on the page. */
async function imageJpeg(img, wPx, hPx) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(wPx * 2.5)); c.height = Math.max(1, Math.round(hPx * 2.5));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = Math.max(c.width / iw, c.height / ih);
  g.drawImage(img, (c.width - iw * s) / 2, (c.height - ih * s) / 2, iw * s, ih * s);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height };
}

/**
 * Draw laid-out pages (elements with class "page", unscaled and visible) into a PDF.
 * meta: { title, author, subject, keywords, lang }, attachment: object to attach as resume.json.
 */
export async function pagesToPdf(pageEls, size, { meta = {}, attachment = null } = {}) {
  const pdf = new PdfWriter();
  const [PW, PH] = PAGE[size].pt;
  const fontsUsed = new Map();
  const fontFor = async (cs) => {
    const id = familyFromCss(cs.fontFamily) || 'instrument';
    const face = faceOf(cs);
    const key = id + face;
    if (!fontsUsed.has(key)) fontsUsed.set(key, pdf.font(key, await loadFont(id, face)));
    return fontsUsed.get(key);
  };

  for (const pageEl of pageEls) {
    const pr = pageEl.getBoundingClientRect();
    const k = PW / pr.width; // px -> pt
    const X = (x) => (x - pr.left) * k;
    const Y = (y) => PH - (y - pr.top) * k;
    const page = pdf.page(PW, PH);
    const visible = (r) => r.width > 0 && r.height > 0 && r.right > pr.left && r.left < pr.right && r.bottom > pr.top && r.top < pr.bottom;

    // Boxes first: backgrounds, borders, photos.
    const all = [pageEl, ...pageEl.querySelectorAll('*')];
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!visible(r)) continue;
      const radius = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, r.width / 2, r.height / 2) * k;
      const bg = parseColor(cs.backgroundColor);
      if (bg && el !== pageEl) page.rect(X(r.left), Y(r.bottom), r.width * k, r.height * k, solid(bg), radius);
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ s, w: parseFloat(cs[`border${s}Width`]) || 0, style: cs[`border${s}Style`], c: parseColor(cs[`border${s}Color`]) }));
      const drawn = sides.filter((x) => x.w > 0 && x.style !== 'none' && x.c);
      if (drawn.length === 4 && radius > 0) page.strokeRect(X(r.left), Y(r.bottom), r.width * k, r.height * k, solid(drawn[0].c), drawn[0].w * k, radius);
      else for (const b of drawn) {
        const w = b.w * k, col = solid(b.c);
        if (b.s === 'Top') page.rect(X(r.left), Y(r.top) - w, r.width * k, w, col);
        if (b.s === 'Bottom') page.rect(X(r.left), Y(r.bottom), r.width * k, w, col);
        if (b.s === 'Left') page.rect(X(r.left), Y(r.bottom), w, r.height * k, col);
        if (b.s === 'Right') page.rect(X(r.right) - w, Y(r.bottom), w, r.height * k, col);
      }
      if (el.tagName === 'IMG' && el.complete && el.naturalWidth) {
        try {
          const j = await imageJpeg(el, r.width, r.height);
          page.image(pdf.jpeg(j.bytes, j.width, j.height), X(r.left), Y(r.bottom), r.width * k, r.height * k, radius);
        } catch (e) { console.warn('Left a picture out of the PDF:', e); }
      }
    }

    // Then the words, gathered into runs (one line, one style) in reading order.
    const range = document.createRange();
    const words = [];
    for (const node of textNodes(pageEl)) {
      const el = node.parentElement;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const color = parseColor(cs.color);
      if (!color) continue;
      const font = await fontFor(cs);
      const size = parseFloat(cs.fontSize) * k;
      const ratio = baselineRatio(cs);
      const charSpace = (parseFloat(cs.letterSpacing) || 0) * k;
      const upper = cs.textTransform === 'uppercase';
      const style = { font, size, color: solid(color), charSpace };
      const text = node.data;
      const push = (str, rect) => words.push({ ...style, str: upper ? str.toUpperCase() : str, x: X(rect.left), y: Y(rect.top + rect.height * ratio) });
      const re = /\S+/g;
      let m;
      while ((m = re.exec(text))) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rects = [...range.getClientRects()].filter(visible);
        if (!rects.length) continue;
        if (rects.length === 1) { push(m[0], rects[0]); continue; }
        // A word broken across lines (long web addresses): split it where the lines break.
        let run = '', runRect = null;
        for (let i = 0; i < m[0].length; i++) {
          range.setStart(node, m.index + i); range.setEnd(node, m.index + i + 1);
          const cr = range.getClientRects()[0];
          if (!cr) continue;
          if (runRect && Math.abs(cr.top - runRect.top) < 1) run += m[0][i];
          else { if (run) push(run, runRect); run = m[0][i]; runRect = cr; }
        }
        if (run) push(run, runRect);
      }
    }
    let run = [];
    const flush = () => { if (run.length) page.textRun(run[0].font, run[0].size, run[0].y, run, { color: run[0].color, charSpace: run[0].charSpace }); run = []; };
    for (const w of words) {
      const prev = run[run.length - 1];
      const same = prev && prev.font === w.font && Math.abs(prev.size - w.size) < 0.01 && prev.color.join() === w.color.join() && Math.abs(prev.charSpace - w.charSpace) < 0.001 && Math.abs(prev.y - w.y) < 0.6 && w.x > prev.x;
      if (!same) flush();
      run.push(w);
    }
    flush();

    // Links.
    for (const a of pageEl.querySelectorAll('a[href]')) {
      for (const r of a.getClientRects()) if (visible(r)) page.link(X(r.left), Y(r.bottom), r.width * k, r.height * k, a.href);
    }
  }
  pdf.info(meta);
  if (attachment) pdf.attach('resume.json', new TextEncoder().encode(JSON.stringify(attachment, null, 2)), 'application/json', 'This CV as JSON Resume, for importing into Quire or other tools');
  return pdf.save();
}

export { FONTS };
