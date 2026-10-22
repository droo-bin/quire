// The CV itself. Content is kept as JSON Resume (https://jsonresume.org/schema), so it can go in and out
// of other tools unchanged; Quire's own extras (layout, custom sections, hidden entries) travel alongside
// it, and inside `meta.quire` when exported.

import { parseDate, dateValue } from './dates.js';

/** Every kind of section, what its entries hold and how a template should read them. */
export const SECTIONS = {
  summary: { title: 'Summary', single: true, hint: 'Two or three lines on who you are and what you are looking for.' },
  work: {
    title: 'Experience', key: 'work', add: 'Add a job',
    fields: [
      { key: 'position', label: 'Job title' }, { key: 'name', label: 'Employer' },
      { key: 'location', label: 'Location' }, { key: 'url', label: 'Website', type: 'url' },
      { key: 'startDate', label: 'Started', type: 'date' }, { key: 'endDate', label: 'Finished', type: 'date', present: true },
      { key: 'summary', label: 'Summary', type: 'textarea' }, { key: 'highlights', label: 'What you did', type: 'list', item: 'Achievement' },
    ],
    view: { title: 'position', subtitle: 'name', location: 'location', start: 'startDate', end: 'endDate', url: 'url', summary: 'summary', list: 'highlights' },
  },
  projects: {
    title: 'Projects', key: 'projects', add: 'Add a project',
    fields: [
      { key: 'name', label: 'Project' }, { key: 'entity', label: 'For (optional)' }, { key: 'url', label: 'Link', type: 'url' },
      { key: 'startDate', label: 'Started', type: 'date' }, { key: 'endDate', label: 'Finished', type: 'date', present: true },
      { key: 'description', label: 'Description', type: 'textarea' }, { key: 'highlights', label: 'Highlights', type: 'list', item: 'Highlight' },
      { key: 'keywords', label: 'Tools and keywords', type: 'tags' },
    ],
    view: { title: 'name', subtitle: 'entity', start: 'startDate', end: 'endDate', url: 'url', summary: 'description', list: 'highlights', tags: 'keywords' },
  },
  education: {
    title: 'Education', key: 'education', add: 'Add a qualification',
    fields: [
      { key: 'studyType', label: 'Qualification', placeholder: 'BSc, A levels, Diploma…' }, { key: 'area', label: 'Subject' },
      { key: 'institution', label: 'Where' }, { key: 'location', label: 'Location' }, { key: 'score', label: 'Grade' },
      { key: 'startDate', label: 'Started', type: 'date' }, { key: 'endDate', label: 'Finished', type: 'date', present: true },
      { key: 'url', label: 'Website', type: 'url' }, { key: 'summary', label: 'Notes', type: 'textarea' },
      { key: 'courses', label: 'Modules or courses', type: 'list', item: 'Module' },
    ],
    view: { title: (e) => [e.studyType, e.area].filter(Boolean).join(' in ').replace(/^(A levels?|GCSEs?) in /i, '$1: '), subtitle: 'institution', location: 'location', start: 'startDate', end: 'endDate', url: 'url', grade: 'score', summary: 'summary', list: 'courses' },
  },
  skills: {
    title: 'Skills', key: 'skills', add: 'Add a skill group', compact: true,
    fields: [{ key: 'name', label: 'Skill or group', placeholder: 'e.g. Languages, or just "Python"' }, { key: 'level', label: 'Level (optional)', type: 'level' }, { key: 'keywords', label: 'Skills', type: 'tags' }],
    view: { title: 'name', level: 'level', tags: 'keywords' },
  },
  languages: {
    title: 'Languages', key: 'languages', add: 'Add a language', compact: true,
    fields: [{ key: 'language', label: 'Language' }, { key: 'fluency', label: 'How well', type: 'fluency' }],
    view: { title: 'language', level: 'fluency' },
  },
  certificates: {
    title: 'Certifications', key: 'certificates', add: 'Add a certification',
    fields: [{ key: 'name', label: 'Certificate' }, { key: 'issuer', label: 'Issued by' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'url', label: 'Link', type: 'url' }],
    view: { title: 'name', subtitle: 'issuer', start: 'date', single: true, url: 'url' },
  },
  awards: {
    title: 'Awards', key: 'awards', add: 'Add an award',
    fields: [{ key: 'title', label: 'Award' }, { key: 'awarder', label: 'Given by' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'summary', label: 'Details', type: 'textarea' }],
    view: { title: 'title', subtitle: 'awarder', start: 'date', single: true, summary: 'summary' },
  },
  publications: {
    title: 'Publications', key: 'publications', add: 'Add a publication',
    fields: [{ key: 'name', label: 'Title' }, { key: 'publisher', label: 'Published in or by' }, { key: 'releaseDate', label: 'Date', type: 'date' }, { key: 'url', label: 'Link', type: 'url' }, { key: 'summary', label: 'Summary', type: 'textarea' }],
    view: { title: 'name', subtitle: 'publisher', start: 'releaseDate', single: true, url: 'url', summary: 'summary' },
  },
  volunteer: {
    title: 'Volunteering', key: 'volunteer', add: 'Add a role',
    fields: [
      { key: 'position', label: 'Role' }, { key: 'organization', label: 'Organisation' }, { key: 'url', label: 'Website', type: 'url' },
      { key: 'startDate', label: 'Started', type: 'date' }, { key: 'endDate', label: 'Finished', type: 'date', present: true },
      { key: 'summary', label: 'Summary', type: 'textarea' }, { key: 'highlights', label: 'What you did', type: 'list', item: 'Highlight' },
    ],
    view: { title: 'position', subtitle: 'organization', start: 'startDate', end: 'endDate', url: 'url', summary: 'summary', list: 'highlights' },
  },
  interests: {
    title: 'Interests', key: 'interests', add: 'Add an interest', compact: true,
    fields: [{ key: 'name', label: 'Interest' }, { key: 'keywords', label: 'Details', type: 'tags' }],
    view: { title: 'name', tags: 'keywords' },
  },
  references: {
    title: 'References', key: 'references', add: 'Add a reference',
    fields: [{ key: 'name', label: 'Name and role' }, { key: 'reference', label: 'Contact details or quote', type: 'textarea' }],
    view: { title: 'name', summary: 'reference' },
  },
};

/** Fields a custom section's entries have. */
export const CUSTOM_FIELDS = [
  { key: 'title', label: 'Title' }, { key: 'subtitle', label: 'Subtitle' }, { key: 'location', label: 'Location' },
  { key: 'startDate', label: 'Started', type: 'date' }, { key: 'endDate', label: 'Finished', type: 'date', present: true },
  { key: 'url', label: 'Link', type: 'url' }, { key: 'summary', label: 'Details', type: 'textarea' }, { key: 'highlights', label: 'Points', type: 'list', item: 'Point' },
];
export const CUSTOM_VIEW = { title: 'title', subtitle: 'subtitle', location: 'location', start: 'startDate', end: 'endDate', url: 'url', summary: 'summary', list: 'highlights' };

export const DEFAULT_ORDER = ['summary', 'work', 'projects', 'education', 'skills', 'certificates', 'languages', 'awards', 'publications', 'volunteer', 'interests', 'references'];
export const FLUENCY = ['Native or bilingual', 'Fluent', 'Professional working', 'Conversational', 'Basic'];
export const LEVELS = ['Expert', 'Advanced', 'Intermediate', 'Beginner'];
const LIST_KEYS = new Set(['highlights', 'courses', 'keywords', 'roles']);

/** Section definition for an id, custom sections included. */
export function sectionDef(id, doc) {
  if (id.startsWith('custom:')) {
    const c = (doc.custom || []).find((x) => 'custom:' + x.id === id);
    return { title: c ? c.title : 'Section', custom: true, fields: CUSTOM_FIELDS, view: CUSTOM_VIEW, add: 'Add an entry' };
  }
  return SECTIONS[id];
}

/** The entries array behind a section id (live reference). */
export function sectionItems(doc, id) {
  if (id.startsWith('custom:')) { const c = (doc.custom || []).find((x) => 'custom:' + x.id === id); return c ? c.items : []; }
  if (id === 'summary') return [];
  return doc.resume[SECTIONS[id].key] || (doc.resume[SECTIONS[id].key] = []);
}

/** Path of an entry, for checks and for jumping between the preview and the editor. */
export function itemPath(id, i) { return id.startsWith('custom:') ? `${id}.${i}` : `${SECTIONS[id].key}.${i}`; }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function blankResume() {
  return {
    basics: { name: '', label: '', image: '', email: '', phone: '', url: '', summary: '', location: { city: '', region: '', countryCode: '', address: '', postalCode: '' }, profiles: [] },
    work: [], volunteer: [], education: [], awards: [], certificates: [], publications: [], skills: [], languages: [], interests: [], references: [], projects: [],
  };
}

export function defaultLayout(locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-GB') {
  return {
    template: 'modern', font: '', accent: '', size: /^en-(US|CA)|^es-(MX|US)|^fr-CA/.test(locale) ? 'Letter' : 'A4',
    fontScale: 1, spacing: 1, margin: 1, dateFormat: 'mon-yyyy', order: DEFAULT_ORDER.slice(), titles: {}, side: {},
    showPhoto: true, fit: 0, contactStyle: 'line',
  };
}

/** A new document: { id, name, resume, custom, layout, hidden, job }. */
export function newDoc(resume, extras = {}) {
  const doc = {
    id: uid(), name: '', created: Date.now(), updated: Date.now(),
    resume: normalizeResume(resume || blankResume()), custom: [], layout: defaultLayout(), hidden: {}, job: { text: '' },
    ...extras,
  };
  doc.layout = { ...defaultLayout(), ...(extras.layout && typeof extras.layout === 'object' ? extras.layout : {}) };
  sanitizeDoc(doc);
  if (!doc.name || doc.name === 'Untitled CV') doc.name = doc.resume.basics.name ? `${doc.resume.basics.name}'s CV` : 'Untitled CV';
  return doc;
}

/** Make sure every section with content (and every custom section) is somewhere in the order. */
export function syncOrder(doc) {
  const order = doc.layout.order.filter((id) => (id.startsWith('custom:') ? (doc.custom || []).some((c) => 'custom:' + c.id === id) : SECTIONS[id]));
  for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id);
  for (const c of doc.custom || []) if (!order.includes('custom:' + c.id)) order.push('custom:' + c.id);
  doc.layout.order = order;
  return doc;
}

const str = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v.href ? String(v.href) : '');
const strList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split(/\n|;\s*/)).map((x) => (typeof x === 'string' ? x : x && (x.name || x.text || x.summary) ? String(x.name || x.text || x.summary) : str(x))).map((x) => x.replace(/^\s*[•●▪◦‣\-*–]\s*/, '').trim()).filter(Boolean);

/** Tidy anything JSON-Resume-shaped into exactly the shape Quire expects (all arrays present, strings, ISO dates). */
export function normalizeResume(input) {
  const r = blankResume();
  const src = input && typeof input === 'object' ? input : {};
  const b = src.basics || {};
  const loc = b.location && typeof b.location === 'object' ? b.location : { city: str(b.location) };
  r.basics = {
    // Only pictures already inside the file: a web address would be fetched from the network.
    name: str(b.name), label: str(b.label), image: /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(str(b.image || b.picture)) ? str(b.image || b.picture) : '', email: str(b.email), phone: str(b.phone), url: str(b.url || b.website),
    summary: str(b.summary),
    location: { address: str(loc.address), postalCode: str(loc.postalCode), city: str(loc.city), region: str(loc.region), countryCode: str(loc.countryCode) },
    profiles: (Array.isArray(b.profiles) ? b.profiles : []).map((p) => ({ network: str(p.network), username: str(p.username), url: str(p.url) })).filter((p) => p.network || p.url || p.username),
  };
  for (const [id, def] of Object.entries(SECTIONS)) {
    if (!def.key) continue;
    const list = Array.isArray(src[def.key]) ? src[def.key] : [];
    r[def.key] = list.filter((x) => x && typeof x === 'object').map((x) => {
      const out = {};
      for (const f of def.fields) {
        const v = x[f.key];
        if (f.type === 'list' || f.type === 'tags' || LIST_KEYS.has(f.key)) out[f.key] = strList(v);
        else if (f.type === 'date') out[f.key] = normDate(v);
        else out[f.key] = str(v);
      }
      // JSON Resume uses "name" for the employer; older files used "company".
      if (id === 'work' && !out.name && x.company) out.name = str(x.company);
      if (id === 'work' && !out.location && x.location && typeof x.location === 'object') out.location = [x.location.city, x.location.region].filter(Boolean).join(', ');
      if (id === 'volunteer' && !out.organization && x.name) out.organization = str(x.name);
      if (id === 'projects' && x.roles && !out.entity) out.roles = strList(x.roles);
      return out;
    });
  }
  return r;
}

function normDate(v) {
  if (v == null || v === '') return '';
  const d = parseDate(str(v));
  return d == null ? str(v) : d;
}

/** Read and write nested values by a dotted path ("work.2.highlights.0"). */
export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

/** Is a section empty (nothing to show)? */
export function isEmpty(doc, id) {
  if (id === 'summary') return !doc.resume.basics.summary.trim();
  return !sectionItems(doc, id).some((e, i) => !doc.hidden[itemPath(id, i)] && Object.values(e).some((v) => (Array.isArray(v) ? v.length : String(v || '').trim())));
}

/** Newest first, by end date then start date (present at the top). */
export function sortByDate(items, view) {
  const s = view.start, e = view.single ? view.start : view.end;
  return items.slice().sort((a, b) => dateValue(b[e] ?? b[s], 9999) - dateValue(a[e] ?? a[s], 9999) || dateValue(b[s], 0) - dateValue(a[s], 0));
}

/** The document as JSON Resume: what's shown, in the shown order, plus Quire's extras under meta.quire. */
export function toJsonResume(doc, { withMeta = true } = {}) {
  const r = JSON.parse(JSON.stringify(doc.resume));
  const off = doc.layout.hiddenSections || {};
  if (off.summary) r.basics.summary = '';
  for (const [id, def] of Object.entries(SECTIONS)) {
    if (!def.key) continue;
    if (off[id]) { r[def.key] = []; }
    r[def.key] = r[def.key].filter((e, i) => !doc.hidden[`${def.key}.${i}`]).map((e) => prune(e));
    if (!r[def.key].length) delete r[def.key];
  }
  // Hidden bullets too: rebuild each shown entry's lists from the original without them.
  for (const def of Object.values(SECTIONS)) {
    if (!def.key || !r[def.key]) continue;
    let shown = 0;
    doc.resume[def.key].forEach((orig, i) => {
      if (doc.hidden[`${def.key}.${i}`]) return;
      for (const lk of ['highlights', 'courses']) if (Array.isArray(orig[lk]) && r[def.key][shown][lk]) r[def.key][shown][lk] = orig[lk].filter((x, j) => !doc.hidden[`${def.key}.${i}.${lk}.${j}`] && x.trim());
      shown++;
    });
  }
  const b = r.basics;
  b.profiles = b.profiles.filter((p) => p.url || p.username);
  if (!doc.layout.showPhoto) b.image = '';
  for (const k of Object.keys(b)) if (b[k] === '') delete b[k];
  if (b.location) { for (const k of Object.keys(b.location)) if (!b.location[k]) delete b.location[k]; if (!Object.keys(b.location).length) delete b.location; }
  if (!withMeta) return r;
  r.meta = {
    version: 'v1.0.0', lastModified: new Date(doc.updated || Date.now()).toISOString(),
    quire: { version: 1, name: doc.name, layout: doc.layout, custom: doc.custom, hidden: doc.hidden, job: doc.job, full: doc.resume },
  };
  return r;
}

function prune(e) {
  const out = {};
  for (const [k, v] of Object.entries(e)) {
    if (Array.isArray(v)) { const l = v.filter((x) => String(x).trim()); if (l.length) out[k] = l; } else if (v !== '' && v != null) out[k] = v;
  }
  return out;
}

/** A Quire document from JSON Resume, restoring Quire's extras if the file came from Quire. */
export function fromJsonResume(json) {
  const q = json && json.meta && json.meta.quire;
  if (q && q.full) {
    return sanitizeDoc(newDoc(q.full, { name: typeof q.name === 'string' ? q.name : '', layout: q.layout, custom: q.custom, hidden: q.hidden, job: q.job }));
  }
  return newDoc(json);
}

/** Sections that are on the CV: in order, not hidden, not empty. */
export function shownSections(doc) {
  const off = doc.layout.hiddenSections || {};
  return doc.layout.order.filter((id) => !off[id] && !isEmpty(doc, id));
}

const plainObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const TEMPLATE_IDS = ['modern', 'classic', 'sidebar', 'compact', 'banner', 'timeline'];
const FONT_IDS = ['instrument', 'work', 'carlito', 'lora', 'plex', 'caladea'];

/**
 * Make a document safe to open whatever file it came from: every part the right shape, layout values
 * from the allowed lists. Called on everything loaded or imported.
 */
export function sanitizeDoc(doc) {
  doc.resume = normalizeResume(doc.resume);
  doc.name = typeof doc.name === 'string' && doc.name ? doc.name : 'Untitled CV';
  doc.custom = (Array.isArray(doc.custom) ? doc.custom : []).filter((c) => c && typeof c === 'object').map((c) => ({
    id: /^[\w-]{1,40}$/.test(String(c.id)) ? String(c.id) : uid(),
    title: str(c.title) || 'Section',
    items: (Array.isArray(c.items) ? c.items : []).filter((e) => e && typeof e === 'object').map((e) => Object.fromEntries(CUSTOM_FIELDS.map((f) => [f.key, f.type === 'list' ? strList(e[f.key]) : f.type === 'date' ? normDate(e[f.key]) : str(e[f.key])]))),
  }));
  const hidden = {};
  for (const [k, v] of Object.entries(plainObj(doc.hidden))) if (v && typeof k === 'string' && k.length < 120) hidden[k] = true;
  doc.hidden = hidden;
  doc.job = { text: str(plainObj(doc.job).text) };
  doc.ignored = Object.fromEntries(Object.entries(plainObj(doc.ignored)).filter(([, v]) => v === true));
  const L = { ...defaultLayout(), ...plainObj(doc.layout) };
  if (!TEMPLATE_IDS.includes(L.template)) L.template = 'modern';
  if (L.font && !FONT_IDS.includes(L.font)) L.font = '';
  if (L.accent && !/^#[0-9a-f]{6}$/i.test(L.accent)) L.accent = '';
  if (!['A4', 'Letter'].includes(L.size)) L.size = 'A4';
  for (const k of ['fontScale', 'spacing', 'margin']) { const n = +L[k]; L[k] = Number.isFinite(n) ? Math.min(1.6, Math.max(0.5, n)) : 1; }
  L.fit = [0, 1, 2].includes(+L.fit) ? +L.fit : 0;
  if (!['mon-yyyy', 'month-yyyy', 'mm-yyyy', 'yyyy'].includes(L.dateFormat)) L.dateFormat = 'mon-yyyy';
  L.showPhoto = L.showPhoto !== false;
  L.order = (Array.isArray(L.order) ? L.order : []).filter((x) => typeof x === 'string');
  for (const k of ['titles', 'side', 'hiddenSections', 'added']) L[k] = Object.fromEntries(Object.entries(plainObj(L[k])).filter(([key, v]) => typeof key === 'string' && (typeof v === 'string' || v === true)).map(([key, v]) => [key, k === 'side' ? (v === 'side' ? 'side' : 'main') : v]));
  doc.layout = L;
  return syncOrder(doc);
}

/** Plain text of the whole CV as shown, for word counts and keyword matching. */
export function allText(doc) {
  const r = toJsonResume(doc, { withMeta: false });
  const out = [];
  const walk = (v) => { if (typeof v === 'string') { if (!/^data:/.test(v)) out.push(v); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(r);
  for (const c of doc.custom || []) { if ((doc.layout.hiddenSections || {})['custom:' + c.id]) continue; out.push(c.title); walk(c.items.filter((e, i) => !doc.hidden[`custom:${c.id}.${i}`])); }
  return out.join('\n');
}
