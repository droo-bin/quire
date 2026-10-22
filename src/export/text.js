// The CV as plain text (for pasting into application forms) or Markdown.

import { sectionDef, sectionItems, itemPath, shownSections } from '../lib/model.js';
import { formatRange, formatDate } from '../lib/dates.js';

export function toText(doc, { markdown = false } = {}) {
  const b = doc.resume.basics;
  const out = [];
  const strip = (s) => (markdown ? s : String(s).replace(/\*\*([^*]+)\*\*/g, '$1'));
  out.push(markdown ? `# ${b.name}` : b.name.toUpperCase());
  if (b.label) out.push(markdown ? `**${b.label}**` : b.label);
  const loc = [b.location.city, b.location.region].filter(Boolean).join(', ');
  const contacts = [loc, b.email, b.phone, b.url, ...b.profiles.map((p) => p.url || `${p.network}: ${p.username}`)].filter(Boolean);
  if (contacts.length) out.push(contacts.join(markdown ? ' · ' : ' | '));
  for (const id of shownSections(doc)) {
    const def = sectionDef(id, doc);
    const title = doc.layout.titles[id] || def.title;
    out.push('', markdown ? `## ${title}` : title.toUpperCase(), markdown ? '' : '-'.repeat(title.length));
    if (id === 'summary') { out.push(strip(b.summary)); continue; }
    const v = def.view;
    sectionItems(doc, id).forEach((e, i) => {
      if (doc.hidden[itemPath(id, i)]) return;
      const get = (k) => (typeof v[k] === 'function' ? v[k](e) : v[k] ? e[v[k]] : '');
      if (id === 'skills') { out.push(e.keywords.length ? `${markdown ? `**${e.name}:**` : e.name + ':'} ${e.keywords.join(', ')}` : `${e.name}${e.level ? ` (${e.level})` : ''}`); return; }
      if (id === 'languages') { out.push(`${e.language}${e.fluency ? ` – ${e.fluency}` : ''}`); return; }
      if (id === 'interests') { out.push(`${e.name}${e.keywords.length ? `: ${e.keywords.join(', ')}` : ''}`); return; }
      const date = v.start ? (v.single ? (e[v.start] ? formatDate(e[v.start], doc.layout.dateFormat) : '') : formatRange(e[v.start], e[v.end], doc.layout.dateFormat)) : '';
      const head = [get('title'), get('subtitle'), get('location')].filter(Boolean).join(', ');
      out.push('', markdown ? `### ${head}${date ? ` (${date})` : ''}` : `${head}${date ? `  (${date})` : ''}`);
      if (get('grade')) out.push(`Grade: ${get('grade')}`);
      if (v.url && e[v.url]) out.push(e[v.url]);
      if (get('summary')) out.push(strip(get('summary')));
      for (const [j, x] of (v.list ? e[v.list] || [] : []).entries()) if (x.trim() && !doc.hidden[`${itemPath(id, i)}.${v.list}.${j}`]) out.push(`${markdown ? '-' : '•'} ${strip(x)}`);
      if (v.tags && (e[v.tags] || []).length) out.push(e[v.tags].join(', '));
    });
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
