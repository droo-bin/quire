// Templates. Every template draws the same pieces (a header, sections, entries with bullets) from the
// same markup; its look comes from cv.css. A template also decides its default typeface and colour, and
// whether it has a sidebar and which sections go there.

import { SECTIONS, sectionDef, sectionItems, itemPath, isEmpty, FLUENCY } from '../lib/model.js';
import { formatRange, formatDate } from '../lib/dates.js';
import { cssFamily } from './fonts.js';

export const TEMPLATES = {
  modern: { name: 'Modern', blurb: 'Clean and confident. A safe choice for most jobs.', font: 'instrument', accent: '#2045c8', size: 10 },
  classic: { name: 'Classic', blurb: 'Traditional serif, centred heading. Law, finance, academia.', font: 'plex', accent: '#1d2a44', size: 10.2 },
  sidebar: { name: 'Sidebar', blurb: 'Contact details and skills in a side column.', font: 'work', accent: '#0f6b66', size: 9.6, side: ['skills', 'languages', 'certificates', 'interests', 'references'], sideWidth: 33 },
  compact: { name: 'Compact', blurb: 'Dates in the margin, fits a lot on a page.', font: 'carlito', accent: '#33373d', size: 10.2 },
  banner: { name: 'Banner', blurb: 'A coloured band across the top and skill tags.', font: 'lora', accent: '#7a2e4d', size: 10 },
  timeline: { name: 'Timeline', blurb: 'Your career as a line down the page.', font: 'instrument', accent: '#b4462b', size: 9.8 },
};

export const ACCENTS = [
  ['Ink', '#2045c8'], ['Navy', '#1d2a44'], ['Teal', '#0f6b66'], ['Forest', '#2f6a3a'], ['Plum', '#7a2e4d'], ['Brick', '#b4462b'], ['Graphite', '#33373d'],
];

/** The template, typeface and colour actually in use for a document. */
export function look(doc) {
  const L = doc.layout;
  const t = TEMPLATES[L.template] || TEMPLATES.modern;
  return { id: TEMPLATES[L.template] ? L.template : 'modern', t, font: L.font || t.font, accent: L.accent || t.accent };
}

/** Which region a section goes in for this template: 'side' or 'main'. */
export function regionOf(doc, id) {
  const { t } = look(doc);
  if (!t.side) return 'main';
  const choice = doc.layout.side[id];
  if (choice) return choice;
  return t.side.includes(id) ? 'side' : 'main';
}

/* ---------- markup helpers ---------- */

const h = (tag, cls, ...children) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const c of children.flat()) if (c != null && c !== false && c !== '') el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};

/** Text with **bold** marked up. */
export function rich(text) {
  const frag = document.createDocumentFragment();
  String(text || '').split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) frag.append(h('strong', null, part.slice(2, -2)));
    else if (part) frag.append(document.createTextNode(part));
  });
  return frag;
}

const bare = (url) => String(url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
const href = (url) => (/^(https?:|mailto:|tel:)/.test(url) ? url : 'https://' + url);
const link = (url, text, cls) => { const a = h('a', cls, text || bare(url)); a.href = href(url); return a; };

/** Levels as 1-5, from words ("Fluent", "Advanced") or CEFR ("C1"). */
export function levelScore(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return 0;
  const n = t.match(/^(\d(\.\d)?)\s*\/\s*(\d+)$/);
  if (n) return Math.round((+n[1] / +n[3]) * 5);
  if (/native|bilingual|mother|c2|expert|master/.test(t)) return 5;
  if (/fluent|c1|advanced|proficient|full professional/.test(t)) return 4;
  if (/professional|b2|upper|good|strong|working|intermediate|competent/.test(t)) return t.includes('intermediate') || t.includes('working') ? 3 : 4;
  if (/conversational|b1|moderate|familiar/.test(t)) return 3;
  if (/basic|a2|elementary|beginner|novice|limited|a1|learning/.test(t)) return 2;
  return 0;
}

function dots(n, path) {
  const wrap = h('span', 'lvl');
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 1; i <= 5; i++) wrap.append(h('span', i <= n ? 'on' : 'off'));
  return wrap;
}

/* ---------- the header ---------- */

export function contactItems(doc) {
  const b = doc.resume.basics;
  const out = [];
  const loc = [b.location.city, b.location.region].filter(Boolean).join(', ');
  if (loc) out.push({ kind: 'location', text: loc });
  if (b.email) out.push({ kind: 'email', node: () => link('mailto:' + b.email, b.email) });
  if (b.phone) out.push({ kind: 'phone', node: () => link('tel:' + b.phone.replace(/[^\d+]/g, ''), b.phone) });
  if (b.url) out.push({ kind: 'url', node: () => link(b.url) });
  for (const p of b.profiles) {
    if (p.url) out.push({ kind: p.network, node: () => link(p.url) });
    else if (p.username) out.push({ kind: p.network, text: `${p.network}: ${p.username}` });
  }
  return out.map((c) => ({ ...c, node: c.node ? c.node() : document.createTextNode(c.text) }));
}

function header(doc, { stacked } = {}) {
  const b = doc.resume.basics;
  const el = h('header', 'cv-head');
  el.dataset.path = 'basics';
  if (b.image && doc.layout.showPhoto) {
    const img = h('img', 'photo');
    img.src = b.image;
    img.alt = '';
    el.append(img);
  }
  const who = h('div', 'who', h('h1', 'name', b.name || 'Your name'), b.label ? h('p', 'label', b.label) : null);
  el.append(who);
  const contacts = contactItems(doc);
  if (contacts.length) {
    const list = h('div', stacked ? 'contacts stacked' : 'contacts');
    contacts.forEach((c, i) => {
      const item = h('span', 'c c-' + c.kind.toLowerCase().replace(/\W+/g, ''), c.node);
      list.append(item);
      if (!stacked && i < contacts.length - 1) list.append(h('span', 'sep', ' · '));
    });
    (stacked ? el : who).append(list);
  }
  return el;
}

/* ---------- sections ---------- */

function sectionTitle(doc, id) {
  return doc.layout.titles[id] || sectionDef(id, doc).title;
}

function entryNode(doc, id, e, i, inSide) {
  const def = sectionDef(id, doc);
  const v = def.view;
  const get = (k) => (typeof v[k] === 'function' ? v[k](e) : v[k] ? e[v[k]] : '');
  const path = itemPath(id, i);
  const el = h('div', 'entry');
  el.dataset.path = path;
  const title = get('title'), sub = get('subtitle');
  const date = v.start ? (v.single ? (e[v.start] ? formatDate(e[v.start], doc.layout.dateFormat) : '') : formatRange(e[v.start], e[v.end], doc.layout.dateFormat)) : '';
  const loc = get('location');
  const head = h('div', 'e-head');
  const t = h('div', 'e-title');
  if (title) t.append(h('span', 'e-t', rich(title)));
  if (title && sub) t.append(h('span', 'e-dash', ', '));
  if (sub) t.append(h('span', 'e-sub', v.url && e[v.url] && !title ? link(e[v.url], sub) : sub));
  if (get('grade')) t.append(h('span', 'e-grade', get('grade')));
  const lvl = get('level');
  head.append(t);
  if (lvl) {
    const n = levelScore(lvl);
    head.append(n && inSide ? dots(n) : h('span', 'e-level', lvl));
  }
  if (date || loc) head.append(h('div', 'e-meta', date ? h('span', 'e-date', date) : null, date && loc ? h('span', 'msep', ' · ') : null, loc ? h('span', 'e-loc', loc) : null));
  if (!def.compact) head.prepend(h('span', 'dot')); // the timeline template draws it; others hide it
  el.append(head);
  if (v.url && e[v.url] && title) el.append(h('div', 'e-url', link(e[v.url])));
  const sum = get('summary');
  if (sum) for (const para of String(sum).split(/\n{2,}/)) el.append(h('p', 'e-sum', rich(para)));
  const list = v.list && (e[v.list] || []);
  if (list && list.length) {
    const ul = h('ul', 'e-list');
    list.forEach((x, j) => {
      const lp = `${path}.${v.list}.${j}`;
      if (doc.hidden[lp] || !String(x).trim()) return;
      const li = h('li', null, h('span', 'b', '•'), h('span', 'li', rich(x)));
      li.dataset.path = lp;
      ul.append(li);
    });
    if (ul.children.length) el.append(ul);
  }
  const tags = v.tags && (e[v.tags] || []).filter(Boolean);
  if (tags && tags.length) {
    const tg = h('div', 'e-tags');
    tags.forEach((x, j) => { tg.append(h('span', 'tag', x)); if (j < tags.length - 1) tg.append(h('span', 'tsep', ', ')); });
    el.append(tg);
  }
  return el;
}

/** Skills read best as "Group: a, b, c" lines, or one run of names when there are no groups. */
function skillsNodes(doc, items, inSide) {
  const out = [];
  const loose = [];
  items.forEach(({ e, i }) => {
    if (e.keywords.length) {
      const el = h('div', 'entry skill');
      el.dataset.path = itemPath('skills', i);
      const n = levelScore(e.level);
      const head = h('div', 'e-head', h('div', 'e-title', h('span', 'e-t', e.name), h('span', 'e-colon', ':')), e.level ? (n && inSide ? dots(n) : h('span', 'e-level', e.level)) : null);
      el.append(head);
      const tg = h('div', 'e-tags');
      e.keywords.forEach((x, j) => { tg.append(h('span', 'tag', x)); if (j < e.keywords.length - 1) tg.append(h('span', 'tsep', ', ')); });
      el.append(tg);
      out.push(el);
    } else loose.push({ e, i });
  });
  if (loose.length) {
    const anyLevel = loose.some(({ e }) => e.level);
    if (anyLevel || inSide) loose.forEach(({ e, i }) => out.push(entryNode(doc, 'skills', e, i, inSide)));
    else {
      const el = h('div', 'entry skill loose');
      el.dataset.path = itemPath('skills', loose[0].i);
      const tg = h('div', 'e-tags');
      loose.forEach(({ e }, j) => { tg.append(h('span', 'tag', e.name)); if (j < loose.length - 1) tg.append(h('span', 'tsep', ', ')); });
      el.append(tg);
      out.push(el);
    }
  }
  return out;
}

function languagesNodes(doc, items, inSide) {
  if (inSide) return items.map(({ e, i }) => entryNode(doc, 'languages', e, i, true));
  const el = h('div', 'entry langs');
  el.dataset.path = itemPath('languages', items[0].i);
  const tg = h('div', 'e-tags');
  items.forEach(({ e }, j) => {
    tg.append(h('span', 'tag', e.language, e.fluency ? h('span', 'fl', ` (${e.fluency.toLowerCase()})`) : null));
    if (j < items.length - 1) tg.append(h('span', 'tsep', ', '));
  });
  el.append(tg);
  return [el];
}

function interestsNodes(doc, items) {
  if (items.every(({ e }) => !e.keywords.length)) {
    const el = h('div', 'entry interests');
    el.dataset.path = itemPath('interests', items[0].i);
    const p = h('p', 'e-sum', items.map(({ e }) => e.name).join(', '));
    el.append(p);
    return [el];
  }
  return items.map(({ e, i }) => entryNode(doc, 'interests', e, i));
}

/**
 * Blocks for one section: [heading, entry, entry…]. Headings keep with the next block when pages break.
 */
export function sectionBlocks(doc, id, inSide) {
  if (isEmpty(doc, id)) return [];
  const heading = h('h2', 'sec-h', sectionTitle(doc, id));
  heading.dataset.path = 'section:' + id;
  const wrap = (nodes) => { nodes.forEach((n) => n.classList.add('in-' + (id.startsWith('custom:') ? 'custom' : id))); return nodes; };
  if (id === 'summary') {
    const el = h('div', 'entry summary');
    el.dataset.path = 'basics.summary';
    for (const para of doc.resume.basics.summary.split(/\n{2,}/)) el.append(h('p', 'e-sum', rich(para)));
    return [heading, ...wrap([el])];
  }
  const items = sectionItems(doc, id).map((e, i) => ({ e, i })).filter(({ i }) => !doc.hidden[itemPath(id, i)]);
  let nodes;
  if (id === 'skills') nodes = skillsNodes(doc, items, inSide);
  else if (id === 'languages') nodes = languagesNodes(doc, items, inSide);
  else if (id === 'interests') nodes = interestsNodes(doc, items);
  else nodes = items.map(({ e, i }) => entryNode(doc, id, e, i, inSide));
  return [heading, ...wrap(nodes)];
}

/** Everything a template needs to lay out a document. */
export function build(doc) {
  const L = look(doc);
  const regions = { main: [], side: [] };
  for (const id of doc.layout.order) {
    if (doc.layout.hiddenSections && doc.layout.hiddenSections[id]) continue;
    const region = regionOf(doc, id);
    regions[region].push(...sectionBlocks(doc, id, region === 'side'));
  }
  return { look: L, header: header(doc, { stacked: L.id === 'sidebar' }), regions, hasSide: !!L.t.side };
}

/** CSS custom properties for a document's look. */
/** Mix a hex colour with white: tint('#2045c8', 0.1) is a pale wash of it. */
export function tint(hex, amount) {
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => Math.round(255 - (255 - x) * amount));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function lookVars(doc) {
  const { t, font, accent } = look(doc);
  const L = doc.layout;
  return {
    '--accent': accent,
    '--accent-soft': tint(accent, 0.1),
    '--accent-line': tint(accent, 0.45),
    '--font': cssFamily(font),
    '--fs': `${(t.size * (L.fontScale || 1)).toFixed(3)}pt`,
    '--sp': String(L.spacing || 1),
    '--m': `${(14 * (L.margin || 1)).toFixed(2)}mm`,
    '--side': `${t.sideWidth || 0}%`,
  };
}

export { FLUENCY, SECTIONS };
