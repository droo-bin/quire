// The CV as a Word document: one column, real headings, real bullet lists and right-aligned dates, so it
// edits nicely in Word, Pages or Google Docs and reads well in applicant tracking systems. It uses Calibri
// or Cambria (which every copy of Word has) in place of Quire's own typefaces.

import { writeZip } from '../lib/zip.js';
import { SECTIONS, sectionDef, sectionItems, itemPath, shownSections } from '../lib/model.js';
import { formatRange, formatDate } from '../lib/dates.js';
import { look, contactItems } from '../render/templates.js';
import { FONTS } from '../render/fonts.js';

// XML 1.0 doesn't allow most control characters at all, so they go.
const esc = (s) => String(s == null ? '' : s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TWIP = { A4: [11906, 16838], Letter: [12240, 15840] };

export async function toDocx(doc) {
  const L = look(doc);
  const font = FONTS[L.font].kind === 'serif' ? 'Cambria' : 'Calibri';
  const accent = /^#[0-9a-f]{6}$/i.test(L.accent) ? L.accent.slice(1).toUpperCase() : '2045C8';
  const size = TWIP[doc.layout.size] || TWIP.A4;
  const margin = Math.round(14 * (doc.layout.margin || 1) * 56.7);
  const textWidth = size[0] - 2 * margin;
  const base = Math.round((L.t.size * (doc.layout.fontScale || 1)) * 2); // half-points
  const links = [];
  const linkId = (url) => { const id = 'rIdL' + (links.length + 1); links.push([id, url]); return id; };

  const run = (text, { b, i, color, sz } = {}) => {
    const parts = String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean);
    return parts.map((p) => {
      const bold = b || /^\*\*.*\*\*$/.test(p);
      const t = bold && /^\*\*/.test(p) ? p.slice(2, -2) : p;
      return `<w:r><w:rPr>${bold ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${sz ? `<w:sz w:val="${sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
    }).join('');
  };
  const hyperlink = (url, text) => `<w:hyperlink r:id="${linkId(/^(https?:|mailto:|tel:)/.test(url) ? url : 'https://' + url)}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:hyperlink>`;
  const para = (inner, { style, after, before, tab, keep } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${keep ? '<w:keepNext/>' : ''}${tab ? `<w:tabs><w:tab w:val="right" w:pos="${textWidth}"/></w:tabs>` : ''}${after != null || before != null ? `<w:spacing${before != null ? ` w:before="${before}"` : ''}${after != null ? ` w:after="${after}"` : ''}/>` : ''}</w:pPr>${inner}</w:p>`;
  const bullet = (text) => `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;

  const body = [];
  const b = doc.resume.basics;
  body.push(para(run(b.name || 'Your name'), { style: 'Title' }));
  if (b.label) body.push(para(run(b.label, { color: accent }), { style: 'Subtitle' }));
  const contacts = contactItems(doc).map((c) => {
    const a = c.node.nodeType === 1 && c.node.tagName === 'A' ? c.node : null;
    return a ? hyperlink(a.getAttribute('href'), a.textContent) : run(c.node.textContent);
  });
  if (contacts.length) body.push(para(contacts.join(run('  ·  ', { color: '888888' })), { after: 120 }));

  for (const id of shownSections(doc)) {
    const def = sectionDef(id, doc);
    body.push(para(run(doc.layout.titles[id] || def.title), { style: 'Heading1', keep: true }));
    if (id === 'summary') { for (const p of b.summary.split(/\n{2,}/)) body.push(para(run(p))); continue; }
    const v = def.view;
    sectionItems(doc, id).forEach((e, i) => {
      if (doc.hidden[itemPath(id, i)]) return;
      if (id === 'skills') { body.push(para(e.keywords.length ? run(e.name + ': ', { b: true }) + run(e.keywords.join(', ')) : run(e.name + (e.level ? ` (${e.level})` : '')), { after: 40 })); return; }
      if (id === 'languages') { body.push(para(run(e.language, { b: true }) + (e.fluency ? run(`: ${e.fluency}`) : ''), { after: 40 })); return; }
      if (id === 'interests') { body.push(para(run(e.name) + (e.keywords.length ? run(`: ${e.keywords.join(', ')}`) : ''), { after: 40 })); return; }
      const get = (k) => (typeof v[k] === 'function' ? v[k](e) : v[k] ? e[v[k]] : '');
      const title = get('title'), sub = get('subtitle');
      const date = v.start ? (v.single ? (e[v.start] ? formatDate(e[v.start], doc.layout.dateFormat) : '') : formatRange(e[v.start], e[v.end], doc.layout.dateFormat)) : '';
      const head = run(title || sub || '', { b: true }) + (title && sub ? run(', ' + sub) : '') + (get('grade') ? run(`, ${get('grade')}`) : '') + (date ? `<w:r><w:tab/></w:r>${run(date, { color: '555555' })}` : '');
      body.push(para(head, { tab: true, before: 160, after: 20, keep: true }));
      const loc = get('location');
      if (loc) body.push(para(run(loc, { i: true, color: '555555' }), { after: 20, keep: true }));
      if (v.url && e[v.url]) body.push(para(hyperlink(e[v.url], e[v.url].replace(/^https?:\/\/(www\.)?/, '')), { after: 20 }));
      const sum = get('summary');
      if (sum) for (const p of String(sum).split(/\n{2,}/)) body.push(para(run(p), { after: 60 }));
      const list = v.list ? (e[v.list] || []).filter((x, j) => x.trim() && !doc.hidden[`${itemPath(id, i)}.${v.list}.${j}`]) : [];
      for (const x of list) body.push(bullet(x));
      const tags = v.tags ? e[v.tags] || [] : [];
      if (tags.length) body.push(para(run(tags.join(', '), { color: '555555' }), { after: 40 }));
    });
  }

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="${size[0]}" w:h="${size[1]}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${base}"/><w:szCs w:val="${base}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="${Math.round(base * 2.3)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:sz w:val="${Math.round(base * 1.15)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="C9CCD1"/></w:pBdr><w:spacing w:before="280" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:caps/><w:color w:val="${accent}"/><w:spacing w:val="16"/><w:sz w:val="${Math.round(base * 0.95)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="20"/><w:ind w:left="284" w:hanging="227"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="${accent}"/></w:rPr></w:style>
</w:styles>`;

  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="284" w:hanging="227"/></w:pPr><w:rPr><w:color w:val="${accent}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${links.map(([id, url]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(url)}" TargetMode="External"/>`).join('')}</Relationships>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc((b.name ? b.name + ' – ' : '') + 'CV')}</dc:title><dc:creator>${esc(b.name)}</dc:creator><cp:keywords>${esc(doc.resume.skills.flatMap((s) => [s.name, ...s.keywords]).join(', '))}</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;

  return writeZip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['word/document.xml', document],
    ['word/styles.xml', styles],
    ['word/numbering.xml', numbering],
    ['word/_rels/document.xml.rels', rels],
    ['docProps/core.xml', core],
  ]);
}

export { SECTIONS };
