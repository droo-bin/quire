// Any file in, a Quire document out. Structured files (JSON Resume, FRESH, Reactive Resume, LinkedIn
// exports, and PDFs that Quire made) come in exactly; PDFs, Word documents and text are read as well as
// possible, with a report of what was found and what to check.

import { newDoc, fromJsonResume, normalizeResume } from '../lib/model.js';
import { detectJson, fromFresh, fromReactive, fromLinkedIn, isLinkedInZip } from './formats.js';
import { parseCv, textLines } from './text.js';
import { readZip } from '../lib/zip.js';

const NAMES = { jsonresume: 'JSON Resume', fresh: 'FRESH', reactive: 'Reactive Resume', quire: 'Quire', linkedin: 'LinkedIn export', pdf: 'PDF', docx: 'Word document', odt: 'OpenDocument', text: 'text' };

/** Parsed JSON in any known format -> { doc, format }. */
export function fromJson(j) {
  const kind = detectJson(j);
  if (!kind) throw new Error("This JSON file isn't a CV format Quire knows (JSON Resume, FRESH or Reactive Resume).");
  const src = j.resume && !j.basics && !j.meta ? j.resume : j;
  if (kind === 'quire' || kind === 'jsonresume') return { doc: fromJsonResume(src), format: kind };
  if (kind === 'fresh') return { doc: newDoc(fromFresh(src)), format: kind };
  return { doc: newDoc(fromReactive(src)), format: kind };
}

/** Lines from a PDF or Word file -> document plus report. */
function fromLines(lines, format) {
  const { resume, custom, report } = parseCv(lines);
  const doc = newDoc(resume, { custom });
  return { doc, format, report, guessed: true };
}

/**
 * Import a File/Blob. Returns { doc, format, formatName, report?, guessed? }.
 * report: { found: [...], unsure: [...], sections: [...] } for guessed imports.
 */
export async function importFile(file) {
  const name = (file.name || '').toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  let out;
  if (head.startsWith('%PDF')) {
    const { readPdf } = await import('./pdf.js');
    const { lines, attached } = await readPdf(bytes);
    if (attached && detectJson(attached)) out = { ...fromJson(attached), format: 'pdf', exact: true };
    else {
      if (!lines.length) throw new Error("This PDF has no text in it, only pictures of text (it's probably a scan). Quire can't read scans; try the Word version, or paste the text in.");
      out = fromLines(lines, 'pdf');
    }
  } else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = readZip(bytes);
    if (isLinkedInZip(files)) out = { doc: newDoc(await fromLinkedIn(files)), format: 'linkedin' };
    else {
      const { readDocx } = await import('./docx.js');
      const { lines } = await readDocx(bytes);
      out = fromLines(lines, files.has('content.xml') ? 'odt' : 'docx');
    }
  } else if (/\.doc$/.test(name) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
    throw new Error('This is an older Word file (.doc). Open it in Word, Pages or LibreOffice and save it as .docx or PDF, then import that.');
  } else {
    const t = new TextDecoder().decode(bytes);
    const trimmed = t.trim();
    if (/^[{[]/.test(trimmed)) {
      let j;
      try { j = JSON.parse(trimmed); } catch { throw new Error("This file looks like JSON but couldn't be read. Check it's complete and valid."); }
      out = fromJson(j);
    } else if (/^\{\\rtf/.test(trimmed)) {
      out = fromLines(textLines(rtfText(trimmed)), 'text');
    } else {
      out = fromLines(textLines(t), 'text');
    }
  }
  out.formatName = NAMES[out.format] || out.format;
  if (out.doc && file.name && out.guessed && !out.doc.resume.basics.name) out.doc.name = file.name.replace(/\.[^.]+$/, '');
  return out;
}

/** Pasted text -> document plus report. */
export function importText(text) {
  const t = String(text).trim();
  if (/^[{[]/.test(t)) { try { return { ...fromJson(JSON.parse(t)), formatName: 'JSON' }; } catch { /* not JSON after all */ } }
  return { ...fromLines(textLines(t), 'text'), formatName: 'text' };
}

/** Rough RTF to text: drop control words and groups, keep paragraphs. */
function rtfText(rtf) {
  return rtf.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^{}]*\}/g, '').replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '');
}

export { normalizeResume };
