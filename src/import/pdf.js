// PDF -> lines, using pdf.js. A PDF has no paragraphs or headings, only positioned pieces of text, so this
// rebuilds lines (with size, boldness and indent), and reads two-column layouts one column at a time.
// PDFs that Quire made carry the CV as an attached resume.json, which is read back exactly instead.

let pdfjs = null;
async function lib() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/** { lines, attached (parsed JSON or null), pages } */
export async function readPdf(bytes) {
  const { getDocument } = await lib();
  const task = getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  const doc = await task.promise;
  let attached = null;
  try {
    const att = await doc.getAttachments();
    const entries = att instanceof Map ? [...att] : Object.entries(att || {});
    for (const [key, a] of entries) {
      if (!/\.json$/i.test(a.filename || key)) continue;
      const content = a.content || (doc.getAttachmentContent ? await doc.getAttachmentContent(key) : null);
      if (content) { attached = JSON.parse(new TextDecoder().decode(content)); break; }
    }
  } catch { /* no attachments */ }
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false });
    await page.getOperatorList(); // loads the fonts, so their names (…-Bold) can be read
    const bold = new Map();
    const isBold = (fontName) => {
      if (!bold.has(fontName)) {
        let b = false;
        try { const f = page.commonObjs.get(fontName); b = /bold|black|heavy|semibold|demi/i.test((f && (f.name || f.loadedName)) || '') || !!(f && f.bold); } catch { /* unknown */ }
        const style = content.styles[fontName];
        if (style && /bold/i.test(style.fontFamily || '')) b = true;
        bold.set(fontName, b);
      }
      return bold.get(fontName);
    };
    const items = content.items.filter((it) => it.str && it.str.trim()).map((it) => {
      const [a, b, , d, e, f] = it.transform;
      const size = Math.hypot(a, b) || Math.abs(d) || 10;
      return { str: it.str, x: e, y: f, w: it.width || it.str.length * size * 0.5, size, bold: isBold(it.fontName) };
    });
    pages.push({ items, width: vp.width, height: vp.height });
    page.cleanup();
  }
  await task.destroy();
  const lines = documentLines(pages);
  return { lines, attached, pages: lines.length ? lines[lines.length - 1].page : 0 };
}

/**
 * Lines for the whole document. A sidebar usually carries on down the next page, so a run of two-column
 * pages is read one column at a time across all its pages (all of the sidebar, then all of the main
 * column), not page by page, which would drop the second page's sidebar into the middle of a job.
 * Exported for tests: pages are [{ items, width }].
 */
export function documentLines(pages) {
  pages = withoutRunningLines(pages);
  const out = [];
  let run = null; // { first: [lines], second: [lines], firstSide, gutter }
  const lines = (items, p) => toLines(items).map((l) => ({ ...l, page: p }));
  const end = () => { if (run) { out.push(...run.first, ...run.second); run = null; } };
  pages.forEach(({ items, width }, i) => {
    const p = i + 1;
    const split = columns(items, width);
    if (split) {
      const maxSize = (g) => Math.max(0, ...g.map((it) => it.size));
      if (!run) {
        out.push(...lines(split.top, p));
        const firstSide = maxSize(split.right) > maxSize(split.left) ? 'right' : 'left';
        run = { first: [], second: [], firstSide, gutter: split.x };
      } else if (split.top.length) {
        // Something across both columns on a later page (a running header, a wide line) goes with the main column.
        const chars = (g) => g.reduce((n, it) => n + it.str.length, 0);
        const main = chars(split.right) >= chars(split.left) ? 'right' : 'left';
        run[main === run.firstSide ? 'first' : 'second'].push(...lines(split.top, p));
      }
      const [a, b] = run.firstSide === 'left' ? [split.left, split.right] : [split.right, split.left];
      run.first.push(...lines(a, p));
      run.second.push(...lines(b, p));
      run.gutter = split.x;
      return;
    }
    // A page that's all on one side of the gutter carries on that column (the sidebar ran out first).
    if (run && items.length) {
      const minX = Math.min(...items.map((it) => it.x)), maxX = Math.max(...items.map((it) => it.x + it.w));
      const side = minX >= run.gutter - 2 ? 'right' : maxX <= run.gutter + 2 ? 'left' : null;
      if (side) { run[side === run.firstSide ? 'first' : 'second'].push(...lines(items, p)); return; }
    }
    end();
    out.push(...lines(items, p));
  });
  end();
  return out;
}

/** Group one page's text pieces into lines, a column at a time. Exported for tests. */
export function pageLines(items, pageWidth) {
  return documentLines([{ items, width: pageWidth }]).map(({ page, ...l }) => l);
}

/**
 * Running headers and footers ("Jo Bloggs – CV", "Page 2 of 3", an e-mail in the footer) repeat at the
 * same height on every page and would otherwise land in the middle of whatever section a page break cuts.
 * The first page keeps its header; a footer with contact details moves to the top of the first page.
 */
function withoutRunningLines(pages) {
  if (pages.length < 2) return pages;
  const band = (it, h) => (it.y > h * 0.9 ? 'top' : it.y < h * 0.1 ? 'bottom' : null);
  const key = (it) => it.str.trim().replace(/\d+/g, '#') + '@' + Math.round(it.y / 4);
  const seen = new Map();
  pages.forEach(({ items, height }, p) => {
    for (const it of items) if (band(it, height || 842)) { const k = key(it); if (!seen.has(k)) seen.set(k, new Set()); seen.get(k).add(p); }
  });
  const running = new Set([...seen].filter(([, ps]) => ps.size >= 2).map(([k]) => k));
  if (!running.size) return pages;
  const contact = /@|\+?\d[\d\s()-]{8,}\d|linkedin|github|www\.|https?:/i;
  return pages.map(({ items, width, height }, p) => {
    const h = height || 842;
    const keep = [], lift = [];
    for (const it of items) {
      const b = band(it, h);
      if (!b || !running.has(key(it))) keep.push(it);
      else if (p === 0 && b === 'top') keep.push(it);
      else if (p === 0 && contact.test(it.str)) lift.push({ ...it, y: h + 10 + (it.y % 10) });
    }
    return { items: [...lift, ...keep], width, height };
  });
}

/** Find a vertical gutter that splits the page into two columns: { x, top, left, right } or null. */
function columns(items, pageWidth) {
  if (items.length < 12) return null;
  const minY = Math.min(...items.map((i) => i.y)), maxY = Math.max(...items.map((i) => i.y));
  let best = null;
  for (let x = pageWidth * 0.2; x <= pageWidth * 0.8; x += 2) {
    const crossing = items.filter((i) => i.x < x - 1 && i.x + i.w > x + 1);
    const left = items.filter((i) => i.x + i.w <= x + 1), right = items.filter((i) => i.x >= x - 1);
    if (left.length < items.length * 0.15 || right.length < items.length * 0.15) continue;
    // Crossing pieces are allowed only above the columns (a full-width name and contact line).
    const colTop = Math.min(Math.max(...left.map((i) => i.y)), Math.max(...right.map((i) => i.y)));
    const bad = crossing.filter((i) => i.y < colTop - 2);
    if (bad.length) continue;
    // Both columns must run down a good part of the page, or it's just a date column.
    const span = (g) => Math.max(...g.map((i) => i.y)) - Math.min(...g.map((i) => i.y));
    if (span(left) < (maxY - minY) * 0.4 || span(right) < (maxY - minY) * 0.4) continue;
    // Dates in a right-hand column ("2019 – 2021") are short; a real column holds words.
    const avgLen = (g) => g.reduce((n, i) => n + i.str.length, 0) / g.length;
    if (avgLen(right) < 12 && right.every((i) => /\d{4}|present/i.test(i.str) || i.str.length < 25)) continue;
    if (avgLen(left) < 8) continue;
    // A narrow column of dates down the left ("2019 – 2021" beside each job) is part of each entry, not a sidebar.
    const dateish = (g) => g.filter((i) => /\b(19|20)\d{2}\b|present/i.test(i.str) && i.str.length < 32).length / g.length;
    if (dateish(left) > 0.5 || dateish(right) > 0.5) continue;
    const score = Math.min(left.length, right.length);
    if (!best || score > best.score) best = { x, score, left, right, top: crossing };
  }
  if (!best) return null;
  return { x: best.x, top: best.top, left: best.left, right: best.right };
}

function toLines(items) {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const row = rows.find((r) => Math.abs(r.y - it.y) < Math.max(2, Math.min(r.size, it.size) * 0.45));
    if (row) { row.items.push(it); row.size = Math.max(row.size, it.size); } else rows.push({ y: it.y, size: it.size, items: [it] });
  }
  rows.sort((a, b) => b.y - a.y);
  const lines = [];
  let prevY = null;
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    let text = '', lastEnd = null, boldChars = 0, chars = 0;
    const segments = [];
    let seg = null;
    for (const it of r.items) {
      if (lastEnd != null) {
        const gap = it.x - lastEnd;
        if (gap > it.size * 1.5) { text += '   '; seg = null; } // a wide gap: keep it as a separator (dates on the right, columns)
        else if (gap > it.size * 0.12 && !text.endsWith(' ') && !it.str.startsWith(' ')) { text += ' '; if (seg) seg.text += ' '; }
      }
      if (!seg) { seg = { text: '', x: Math.round(it.x), bold: 0, chars: 0 }; segments.push(seg); }
      seg.text += it.str;
      text += it.str;
      lastEnd = it.x + it.w;
      const n = it.str.trim().length; chars += n; if (it.bold) boldChars += n;
      seg.chars += n; if (it.bold) seg.bold += n;
    }
    const gap = prevY == null ? 0 : prevY - r.y;
    prevY = r.y;
    lines.push({ text: text.replace(/\s{4,}/g, '   ').trimEnd(), size: Math.round(r.size * 10) / 10, bold: boldChars > chars * 0.6, x: Math.round(r.items[0].x), gap: Math.round(gap), segments: segments.filter((s) => s.text.trim()).map((s) => ({ text: s.text.trim(), x: s.x, bold: s.bold > s.chars * 0.6 })) });
  }
  return lines;
}
