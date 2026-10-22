// The Design tab: templates (shown with your own CV in them), typeface, colour, size and spacing, paper,
// date style, fitting to a number of pages, and the order and placement of sections.

import { h, icon, grip, sortable } from './util.js';
import { TEMPLATES, ACCENTS, look, regionOf } from '../render/templates.js';
import { FONTS } from '../render/fonts.js';
import { FORMATS } from '../lib/dates.js';
import { sectionDef, isEmpty } from '../lib/model.js';
import { layout } from '../render/paginate.js';

export function renderDesign(app, root) {
  const doc = app.doc;
  const L = doc.layout;
  const cur = look(doc);
  const wrap = h('div.design');

  // Templates, each drawn with this CV.
  const grid = h('div.templates', { role: 'radiogroup', 'aria-label': 'Template' });
  for (const [id, t] of Object.entries(TEMPLATES)) {
    const thumb = h('div.thumb', { 'aria-hidden': 'true' });
    const btn = h('button.template', { type: 'button', role: 'radio', 'aria-checked': String(cur.id === id), on: { click: () => app.edit((d) => { d.layout.template = id; d.layout.font = ''; d.layout.accent = ''; d.layout.side = {}; }, { refresh: true, label: 'Change template' }) } },
      thumb, h('span.t-name', t.name), h('span.t-blurb', t.blurb));
    grid.append(btn);
    queueThumb(app, thumb, id);
  }
  wrap.append(h('section.card', h('header.card-h', h('h2', 'Template')), grid));

  // Typeface and colour.
  const fontSel = h('select#font', { on: { change: (e) => app.edit((d) => { d.layout.font = e.target.value === cur.t.font ? '' : e.target.value; }, { refresh: true }) } },
    Object.entries(FONTS).map(([id, f]) => h('option', { value: id, selected: id === cur.font }, f.name + (f.note ? ` (${f.note})` : '') + (id === cur.t.font ? ' – template default' : ''))));
  fontSel.style.fontFamily = `"Quire ${FONTS[cur.font].name}"`;
  const swatches = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Colour' },
    ACCENTS.map(([name, hex]) => h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': String(cur.accent.toLowerCase() === hex), 'aria-label': name, title: name, style: { background: hex }, on: { click: () => app.edit((d) => { d.layout.accent = hex; }, { refresh: true }) } })),
    h('label.swatch.custom', { title: 'Any colour' }, h('input', { type: 'color', value: cur.accent, 'aria-label': 'Choose any colour', on: { input: (e) => app.edit((d) => { d.layout.accent = e.target.value; }, { coalesce: 'accent' }), change: () => app.refresh() } }), icon('plus', 14)),
  );
  wrap.append(h('section.card', h('header.card-h', h('h2', 'Type and colour')),
    h('div.grid',
      h('div.field.wide', h('label', { for: 'font' }, 'Typeface'), fontSel),
      h('div.field.wide', h('span.label', 'Colour'), swatches),
      slider(app, 'fontScale', 'Text size', 0.85, 1.15, 0.01, (v) => `${Math.round(v * 100)}%`),
      slider(app, 'spacing', 'Spacing', 0.6, 1.5, 0.05, (v) => (v < 0.85 ? 'Tight' : v > 1.15 ? 'Airy' : 'Normal')),
      slider(app, 'margin', 'Margins', 0.6, 1.5, 0.05, (v) => `${Math.round(14 * v)} mm`),
    )));

  // Page.
  const seg = (name, options, value, onPick) => h('div.seg', { role: 'radiogroup', 'aria-label': name }, options.map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(value === v), on: { click: () => onPick(v) } }, label)));
  wrap.append(h('section.card', h('header.card-h', h('h2', 'Page')),
    h('div.grid',
      h('div.field', h('span.label', 'Paper'), seg('Paper', [['A4', 'A4'], ['Letter', 'US Letter']], L.size, (v) => app.edit((d) => { d.layout.size = v; }, { refresh: true }))),
      h('div.field', h('span.label', 'Fit to'), seg('Fit to pages', [[0, 'Off'], [1, '1 page'], [2, '2 pages']], L.fit || 0, (v) => app.edit((d) => { d.layout.fit = v; }, { refresh: true }))),
      h('div.field', h('label', { for: 'datefmt' }, 'Dates'), h('select#datefmt', { on: { change: (e) => app.edit((d) => { d.layout.dateFormat = e.target.value; }, { refresh: true }) } }, Object.entries(FORMATS).map(([k, f]) => h('option', { value: k, selected: k === L.dateFormat }, f.label)))),
      doc.resume.basics.image ? h('div.field', h('span.label', 'Photo'), seg('Photo', [[true, 'Show'], [false, 'Hide']], L.showPhoto !== false, (v) => app.edit((d) => { d.layout.showPhoto = v; }, { refresh: true }))) : null,
    ),
    h('p.hint.fit-note', app.fitNote || ''),
  ));

  // Sections: order, visibility, names, and side or main.
  const list = h('div.sec-list');
  const ids = doc.layout.order.filter((id) => !isEmpty(doc, id) || (doc.layout.hiddenSections || {})[id]);
  ids.forEach((id) => {
    const def = sectionDef(id, doc);
    const hidden = !!(doc.layout.hiddenSections || {})[id];
    const name = h('input', { value: doc.layout.titles[id] || def.title, 'aria-label': `Title for ${def.title}`, on: { input: (e) => app.edit((d) => { const v = e.target.value.trim(); if (id.startsWith('custom:')) { d.custom.find((c) => 'custom:' + c.id === id).title = e.target.value; } else if (!v || v === def.title) delete d.layout.titles[id]; else d.layout.titles[id] = e.target.value; }, { coalesce: 'title' + id }) } });
    const row = h('div.sec-row', { 'data-sort': '', class: hidden ? 'is-hidden' : '' }, grip(def.title), name,
      cur.t.side ? h('div.seg.small', { role: 'radiogroup', 'aria-label': `Column for ${def.title}` }, [['main', 'Main'], ['side', 'Side']].map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(regionOf(doc, id) === v), on: { click: () => app.edit((d) => { d.layout.side = { ...d.layout.side, [id]: v }; }, { refresh: true }) } }, label))) : null,
      h('button.icon', { type: 'button', 'aria-label': hidden ? `Show ${def.title} on the CV` : `Hide ${def.title} from the CV`, title: hidden ? 'Show' : 'Hide', on: { click: () => app.edit((d) => { d.layout.hiddenSections = { ...(d.layout.hiddenSections || {}) }; if (hidden) delete d.layout.hiddenSections[id]; else d.layout.hiddenSections[id] = true; }, { refresh: true }) } }, icon(hidden ? 'eyeOff' : 'eye')));
    list.append(row);
  });
  sortable(list, (from, to) => app.edit((d) => { const order = d.layout.order; const a = order.indexOf(ids[from]), b = order.indexOf(ids[to]); order.splice(b, 0, order.splice(a, 1)[0]); }, { refresh: true, label: 'Move section' }));
  wrap.append(h('section.card', h('header.card-h', h('h2', 'Sections')), h('p.hint', cur.t.side ? 'Drag to reorder. Choose which column each section sits in, rename it, or hide it.' : 'Drag to reorder, rename or hide sections.'), list));
  root.replaceChildren(wrap);
}

function slider(app, key, label, min, max, step, show) {
  const v = app.doc.layout[key] || 1;
  const out = h('output', show(v));
  const id = 'r-' + key;
  const input = h('input', { id, type: 'range', min, max, step, value: v, on: { input: (e) => { out.textContent = show(+e.target.value); app.edit((d) => { d.layout[key] = +e.target.value; }, { coalesce: 'layout.' + key }); } } });
  return h('div.field.range', h('label', { for: id }, label, out), input, h('button.link.reset', { type: 'button', hidden: v === 1, on: { click: () => app.edit((d) => { d.layout[key] = 1; }, { refresh: true }) } }, 'Reset'));
}

/* Template thumbnails: page 1 of this CV in each template, drawn one at a time when the browser is idle. */
let thumbQueue = [];
let thumbBusy = false;
function queueThumb(app, el, id) {
  thumbQueue.push({ app, el, id });
  if (!thumbBusy) drain();
}
function drain() {
  thumbBusy = true;
  const next = thumbQueue.shift();
  if (!next) { thumbBusy = false; return; }
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 30));
  idle(() => {
    try {
      if (next.el.isConnected) {
        const d = JSON.parse(JSON.stringify(next.app.doc));
        d.layout.template = next.id; d.layout.font = ''; d.layout.accent = ''; d.layout.side = {}; d.layout.fit = 0;
        const holder = h('div.thumb-page');
        next.el.append(holder);
        layout(d, holder);
        const pages = holder.querySelectorAll('.page');
        pages.forEach((p, i) => { if (i > 0) p.remove(); });
        const first = pages[0];
        if (first) holder.style.transform = `scale(${next.el.clientWidth / first.offsetWidth})`;
      }
    } catch (e) { console.warn('thumbnail', e); }
    drain();
  });
}
