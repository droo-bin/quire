// Word (.docx) and OpenDocument (.odt) -> lines. Paragraph styles give headings, numbering gives bullets,
// and run formatting gives bold and size. Tables and text boxes, which many CV templates use for layout,
// are read cell by cell. Page headers (often holding the name and contact details) come first.

import { readZip } from '../lib/zip.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function text(files, name) {
  const f = files.get(name);
  return f ? new TextDecoder().decode(await f()) : '';
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, local, ns = W) => [...el.childNodes].filter((n) => n.nodeType === 1 && n.localName === local && n.namespaceURI === ns);
const kid = (el, local, ns) => kids(el, local, ns)[0];
const attr = (el, name) => (el ? el.getAttributeNS(W, name) || el.getAttribute('w:' + name) : null);

export async function readDocx(bytes) {
  const files = readZip(bytes);
  if (!files.has('word/document.xml')) {
    if (files.has('content.xml')) return readOdt(files);
    throw new Error("This doesn't look like a Word document.");
  }
  const styles = xml(await text(files, 'word/styles.xml'));
  const styleInfo = new Map();
  let defaultSize = 22;
  const dd = styles.getElementsByTagNameNS(W, 'rPrDefault')[0];
  const ddsz = dd && dd.getElementsByTagNameNS(W, 'sz')[0];
  if (ddsz) defaultSize = +attr(ddsz, 'val') || 22;
  for (const s of styles.getElementsByTagNameNS(W, 'style')) {
    const id = attr(s, 'styleId');
    const name = (kid(s, 'name') && attr(kid(s, 'name'), 'val')) || id;
    const rpr = kid(s, 'rPr');
    const ppr = kid(s, 'pPr');
    styleInfo.set(id, {
      name, heading: /^(heading|title|subtitle)/i.test(name) || /^Heading\d|^Title/.test(id),
      bold: !!(rpr && kid(rpr, 'b') && attr(kid(rpr, 'b'), 'val') !== '0' && attr(kid(rpr, 'b'), 'val') !== 'false'),
      size: rpr && kid(rpr, 'sz') ? +attr(kid(rpr, 'sz'), 'val') : 0,
      list: !!(ppr && kid(ppr, 'numPr')) || /list/i.test(name),
      basedOn: kid(s, 'basedOn') ? attr(kid(s, 'basedOn'), 'val') : null,
    });
  }
  const style = (id) => { let s = styleInfo.get(id); const seen = new Set(); let out = s ? { ...s } : null; while (s && s.basedOn && !seen.has(s.basedOn)) { seen.add(s.basedOn); s = styleInfo.get(s.basedOn); if (s && out) { out.bold = out.bold || s.bold; out.size = out.size || s.size; out.heading = out.heading || s.heading; } } return out; };

  // Bullets vs numbered lists: numbering.xml says which list formats are "bullet".
  const numbering = xml(await text(files, 'word/numbering.xml') || '<w:numbering xmlns:w="' + W + '"/>');
  const absFormat = new Map();
  for (const a of numbering.getElementsByTagNameNS(W, 'abstractNum')) {
    const lvl = a.getElementsByTagNameNS(W, 'lvl')[0];
    const fmt = lvl && lvl.getElementsByTagNameNS(W, 'numFmt')[0];
    absFormat.set(attr(a, 'abstractNumId'), fmt ? attr(fmt, 'val') : 'bullet');
  }
  const numFormat = new Map();
  for (const n of numbering.getElementsByTagNameNS(W, 'num')) {
    const a = n.getElementsByTagNameNS(W, 'abstractNumId')[0];
    numFormat.set(attr(n, 'numId'), absFormat.get(a && attr(a, 'val')) || 'bullet');
  }

  const rels = new Map();
  const relDoc = xml(await text(files, 'word/_rels/document.xml.rels') || '<Relationships/>');
  for (const r of relDoc.getElementsByTagName('Relationship')) rels.set(r.getAttribute('Id'), r.getAttribute('Target'));

  const lines = [];
  const headerNames = [...files.keys()].filter((k) => /^word\/header\d*\.xml$/.test(k)).sort();
  // First-page, even and default headers often repeat each other.
  for (const h of headerNames) {
    const found = [];
    walkBody(xml(await text(files, h)).documentElement, found, style, numFormat, rels, defaultSize, true);
    lines.push(...found.filter((l) => !lines.some((x) => x.text.trim() === l.text.trim())));
  }
  // Footers sometimes hold the contact details; only those are kept (not page numbers or "CV").
  const footerNames = [...files.keys()].filter((k) => /^word\/footer\d*\.xml$/.test(k)).sort();
  for (const f of footerNames) {
    const found = [];
    walkBody(xml(await text(files, f)).documentElement, found, style, numFormat, rels, defaultSize, true);
    lines.push(...found.filter((l) => /@|\+?\d[\d\s()-]{8,}\d|linkedin|github|www\.|https?:/i.test(l.text) && !lines.some((x) => x.text.trim() === l.text.trim())));
  }
  const doc = xml(await text(files, 'word/document.xml'));
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  walkBody(body, lines, style, numFormat, rels, defaultSize, false);
  return { lines };
}

function inFallback(el) {
  for (let n = el.parentNode; n; n = n.parentNode) if (n.localName === 'Fallback') return true;
  return false;
}

function walkBody(el, lines, style, numFormat, rels, defaultSize, inHeader) {
  for (const n of el.childNodes) {
    if (n.nodeType !== 1) continue;
    if (n.localName === 'p' && n.namespaceURI === W) paragraph(n, lines, style, numFormat, rels, defaultSize);
    else if (n.localName === 'tbl') {
      for (const tr of kids(n, 'tr')) for (const tc of kids(tr, 'tc')) walkBody(tc, lines, style, numFormat, rels, defaultSize, inHeader);
    } else if (n.localName === 'sdt') { const c = kid(n, 'sdtContent'); if (c) walkBody(c, lines, style, numFormat, rels, defaultSize, inHeader); }
    else if (n.localName !== 'sectPr' && n.localName !== 'Fallback') walkBody(n, lines, style, numFormat, rels, defaultSize, inHeader);
  }
}

function paragraph(p, lines, style, numFormat, rels, defaultSize) {
  const ppr = kid(p, 'pPr');
  const st = ppr && kid(ppr, 'pStyle') ? style(attr(kid(ppr, 'pStyle'), 'val')) : style('Normal');
  const numPr = ppr && kid(ppr, 'numPr');
  let bullet = false;
  if (numPr) {
    const id = kid(numPr, 'numId');
    const fmt = numFormat.get(id && attr(id, 'val'));
    bullet = id && attr(id, 'val') !== '0' && fmt !== 'none';
  } else if (st && st.list) bullet = true;
  let txt = '', boldChars = 0, chars = 0, size = 0;
  const boxes = [];
  const run = (r, link) => {
    const rpr = kid(r, 'rPr');
    const b = rpr && kid(rpr, 'b') ? !/^(0|false)$/.test(attr(kid(rpr, 'b'), 'val') || '') : !!(st && st.bold);
    const sz = rpr && kid(rpr, 'sz') ? +attr(kid(rpr, 'sz'), 'val') : (st && st.size) || defaultSize;
    const caps = rpr && kid(rpr, 'caps');
    for (const c of r.childNodes) {
      if (c.nodeType !== 1) continue;
      if (c.localName === 't') { const t = caps ? c.textContent.toUpperCase() : c.textContent; txt += t; const k = t.trim().length; chars += k; if (b) boldChars += k; size = Math.max(size, sz); }
      else if (c.localName === 'tab') txt += '\t';
      else if (c.localName === 'br' || c.localName === 'cr') txt += '\n';
      else if (c.localName === 'sym') txt += '•';
    }
    // Text boxes inside drawings: read after this paragraph.
    // (A text box is often stored twice, as a modern shape and an old-style fallback; read it once.)
    for (const tb of r.getElementsByTagNameNS(W, 'txbxContent')) if (!inFallback(tb)) boxes.push(tb);
    if (link && chars) {
      const target = rels.get(link);
      if (target && /^(https?:|mailto:)/.test(target) && !txt.includes(target.replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/\/$/, ''))) txt += ` <${target.replace(/^mailto:/, '')}>`;
    }
  };
  for (const c of p.childNodes) {
    if (c.nodeType !== 1) continue;
    if (c.localName === 'r') run(c);
    else if (c.localName === 'hyperlink') {
      const id = c.getAttributeNS(R, 'id') || c.getAttribute('r:id');
      const rs = kids(c, 'r');
      rs.forEach((r, i) => run(r, i === rs.length - 1 ? id : null));
    } else if (c.localName === 'smartTag' || c.localName === 'ins' || c.localName === 'fldSimple') for (const r of kids(c, 'r')) run(r);
  }
  let brk = false;
  for (const piece of txt.split('\n')) {
    if (piece.trim()) lines.push({ text: piece, bold: chars > 0 && boldChars > chars * 0.6, size: size / 2 || defaultSize / 2, bullet, heading: !!(st && st.heading), para: true, ...(brk ? { brk } : {}) });
    if (piece.trim()) brk = true;
    bullet = false;
  }
  for (const tb of boxes) walkBody(tb, lines, style, numFormat, rels, defaultSize, false);
}

/* ---------- OpenDocument ---------- */

async function readOdt(files) {
  const doc = xml(await text(files, 'content.xml'));
  const TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
  const lines = [];
  const walk = (el, inList) => {
    for (const n of el.childNodes) {
      if (n.nodeType !== 1) continue;
      if (n.namespaceURI === TEXT && (n.localName === 'p' || n.localName === 'h')) {
        const t = n.textContent;
        if (t.trim()) lines.push({ text: t, heading: n.localName === 'h', bullet: inList, bold: false, size: n.localName === 'h' ? 14 : 11, para: true });
      } else walk(n, inList || n.localName === 'list');
    }
  };
  walk(doc.documentElement, false);
  return { lines };
}
