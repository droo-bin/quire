// The Content tab: your details, then each section as a card of entries. Entries fold up into one line;
// sections, entries and bullet points can be dragged (or moved with the arrow keys) into order, and any
// of them can be hidden from the CV without deleting it.

import { h, icon, iconButton, menu, autosize, grip, sortable, squarePhoto, toast } from './util.js';
import { SECTIONS, CUSTOM_FIELDS, sectionDef, sectionItems, itemPath, uid, FLUENCY, LEVELS, syncOrder } from '../lib/model.js';
import { parseDate, formatDate, formatRange, duration } from '../lib/dates.js';
import { getPathValue, setPathValue } from '../check/checks.js';

const NETWORKS = ['LinkedIn', 'GitHub', 'Portfolio', 'X', 'Mastodon', 'Behance', 'Dribbble', 'Medium', 'Stack Overflow', 'GitLab', 'ORCID', 'Website'];

/** Sections shown in the editor: anything with content, plus the ones the person added. */
export function visibleSections(doc) {
  return doc.layout.order.filter((id) => id === 'summary' || (doc.layout.added && doc.layout.added[id]) || id.startsWith('custom:') || sectionItems(doc, id).length);
}

export function renderEditor(app, root) {
  const doc = app.doc;
  const wrap = h('div.editor');
  wrap.append(detailsCard(app));
  const list = h('div.sections');
  for (const id of visibleSections(doc)) list.append(sectionCard(app, id));
  sortable(list, (from, to) => {
    const ids = visibleSections(app.doc);
    app.edit((d) => {
      const order = d.layout.order;
      const a = order.indexOf(ids[from]), b = order.indexOf(ids[to]);
      order.splice(b, 0, order.splice(a, 1)[0]);
    }, { refresh: true, label: 'Move section', focusGrip: `section:${ids[from]}` });
  });
  wrap.append(list);
  const add = h('button.add-section', { type: 'button', on: { click: (e) => addSectionMenu(app, e.currentTarget) } }, icon('plus'), 'Add a section');
  wrap.append(add);
  root.replaceChildren(wrap);
}

function addSectionMenu(app, anchor) {
  const doc = app.doc;
  const shown = new Set(visibleSections(doc));
  const items = Object.entries(SECTIONS).filter(([id]) => !shown.has(id)).map(([id, def]) => ({ label: def.title, onClick: () => addSection(app, id) }));
  items.push('sep', { label: 'A section of your own…', hint: 'e.g. Publications, Teaching, Exhibitions', onClick: () => addCustom(app) });
  menu(anchor, items);
}

function addSection(app, id) {
  app.edit((d) => {
    d.layout.added = { ...(d.layout.added || {}), [id]: true };
    delete (d.layout.hiddenSections || {})[id];
    if (id !== 'summary' && !sectionItems(d, id).length) sectionItems(d, id).push(blankItem(id));
    // Put it after the last visible section so it appears where you are.
  }, { refresh: true, open: id === 'summary' ? null : itemPath(id, 0), label: 'Add section' });
  app.scrollTo(`section:${id}`);
}

function addCustom(app) {
  const id = uid();
  app.edit((d) => {
    d.custom = d.custom || [];
    d.custom.push({ id, title: 'New section', items: [blankItem('custom:' + id)] });
    syncOrder(d);
  }, { refresh: true, open: `custom:${id}.0`, label: 'Add section' });
  requestAnimationFrame(() => { const t = document.querySelector(`[data-field="title:custom:${id}"]`); if (t) { t.focus(); t.select(); } });
}

export function blankItem(id) {
  const fields = id.startsWith('custom:') ? CUSTOM_FIELDS : SECTIONS[id].fields;
  return Object.fromEntries(fields.map((f) => [f.key, f.type === 'list' || f.type === 'tags' ? [] : '']));
}

/* ---------- details ---------- */

function field(app, path, label, opts = {}) {
  const value = getPathValue(app.doc, path) || '';
  const id = 'f-' + path.replace(/[^\w]/g, '-');
  const input = opts.textarea
    ? autosize(h('textarea', { id, rows: opts.rows || 3, 'data-field': path, placeholder: opts.placeholder || '', value }))
    : h('input', { id, type: opts.type || 'text', 'data-field': path, value, placeholder: opts.placeholder || '', autocomplete: opts.autocomplete || 'off', spellcheck: opts.spell === false ? 'false' : 'true' });
  input.addEventListener('input', () => app.edit((d) => setPathValue(d, path, input.value), { coalesce: path }));
  const f = h('div.field' + (opts.wide ? '.wide' : ''), h('label', { for: id, class: opts.hideLabel ? 'vh' : '' }, label), input, opts.after || null, hintsFor(app, path));
  return f;
}

function hintsFor(app, path) {
  const list = (app.checksByPath.get(path) || []).filter((c) => c.level !== 'note');
  if (!list.length) return null;
  return h('div.inline-hints', list.map((c) => h('p.inline-hint', { class: c.level }, icon('pen', 13), h('span', c.title), c.fix ? h('button.link', { type: 'button', on: { click: () => app.applyFix(c) } }, c.fix.label) : null)));
}

function detailsCard(app) {
  const doc = app.doc;
  const b = doc.resume.basics;
  const card = h('section.card.details', { 'data-path': 'basics' });
  const photo = h('div.photo-pick',
    b.image ? h('img', { src: b.image, alt: 'Your photo' }) : h('span.photo-empty', icon('plus', 16), 'Photo'),
    h('input.vh', { type: 'file', accept: 'image/*', id: 'photo-input', tabindex: '-1', on: { change: async (e) => { const f = e.target.files[0]; if (!f) return; try { const url = await squarePhoto(f); app.edit((d) => { d.resume.basics.image = url; d.layout.showPhoto = true; }, { refresh: true, label: 'Add photo' }); } catch (err) { toast(err.message); } } } }),
  );
  photo.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') document.getElementById('photo-input').click(); });
  photo.setAttribute('role', 'button');
  photo.tabIndex = 0;
  photo.title = b.image ? 'Change photo' : 'Add a photo (optional)';
  photo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('photo-input').click(); } });
  card.append(
    h('header.card-h', h('h2', 'Your details')),
    h('div.grid',
      h('div.who-row', photo, h('div.who-fields', field(app, 'basics.name', 'Full name', { autocomplete: 'name' }), field(app, 'basics.label', 'Headline', { placeholder: 'e.g. Senior Data Engineer' }))),
      field(app, 'basics.email', 'Email', { type: 'email', autocomplete: 'email', spell: false }),
      field(app, 'basics.phone', 'Phone', { type: 'tel', autocomplete: 'tel', spell: false }),
      field(app, 'basics.location.city', 'Town or city', { placeholder: 'e.g. Leeds' }),
      field(app, 'basics.location.region', 'Region or country', { placeholder: 'e.g. UK' }),
      field(app, 'basics.url', 'Website', { type: 'url', spell: false, wide: true, placeholder: 'yoursite.com' }),
    ),
  );
  if (b.image) card.querySelector('.who-row').append(h('div.photo-actions', h('button.link', { type: 'button', on: { click: () => app.edit((d) => { d.resume.basics.image = ''; }, { refresh: true, label: 'Remove photo' }) } }, 'Remove photo')));
  // Profiles
  const profiles = h('div.profiles', { 'data-path': 'basics.profiles' });
  b.profiles.forEach((p, i) => {
    const net = h('select', { 'aria-label': 'Network', 'data-field': `basics.profiles.${i}.network` }, [...new Set([p.network, ...NETWORKS].filter(Boolean))].map((n) => h('option', { value: n, selected: n === p.network }, n)));
    net.addEventListener('change', () => app.edit((d) => { d.resume.basics.profiles[i].network = net.value; }));
    const url = h('input', { type: 'url', 'aria-label': `${p.network || 'Profile'} address`, placeholder: 'linkedin.com/in/you', value: p.url || p.username, 'data-field': `basics.profiles.${i}.url`, spellcheck: 'false' });
    url.addEventListener('input', () => app.edit((d) => { const pr = d.resume.basics.profiles[i]; pr.url = url.value.trim(); pr.username = (url.value.trim().replace(/\/$/, '').split('/').pop() || '').replace(/^@/, ''); if (!pr.network || pr.network === 'Website') pr.network = guessNetwork(url.value) || pr.network; }, { coalesce: `profile${i}` }));
    url.addEventListener('change', () => { const g = guessNetwork(url.value); if (g && g !== net.value) app.edit((d) => { d.resume.basics.profiles[i].network = g; }, { refresh: true }); });
    profiles.append(h('div.profile-row', net, url, iconButton('trash', 'Remove this link', () => app.edit((d) => d.resume.basics.profiles.splice(i, 1), { refresh: true, label: 'Remove link' }))));
  });
  profiles.append(h('button.link.add-row', { type: 'button', on: { click: () => app.edit((d) => d.resume.basics.profiles.push({ network: d.resume.basics.profiles.some((x) => x.network === 'LinkedIn') ? 'GitHub' : 'LinkedIn', username: '', url: '' }), { refresh: true, focus: `basics.profiles.${b.profiles.length}.url` }) } }, icon('plus', 15), 'Add LinkedIn, GitHub or another link'));
  card.append(h('div.sub', h('h3', 'Links'), profiles));
  return card;
}

function guessNetwork(url) {
  const u = String(url).toLowerCase();
  return [['linkedin.com', 'LinkedIn'], ['github.com', 'GitHub'], ['gitlab.com', 'GitLab'], ['behance.net', 'Behance'], ['dribbble.com', 'Dribbble'], ['medium.com', 'Medium'], ['stackoverflow.com', 'Stack Overflow'], ['orcid.org', 'ORCID'], ['twitter.com', 'X'], ['x.com', 'X']].find(([d]) => u.includes(d))?.[1] || null;
}

/* ---------- sections ---------- */

function sectionCard(app, id) {
  const doc = app.doc;
  const def = sectionDef(id, doc);
  const title = doc.layout.titles[id] || def.title;
  const hiddenSection = doc.layout.hiddenSections && doc.layout.hiddenSections[id];
  const card = h('section.card.sec', { 'data-sort': '', 'data-path': `section:${id}`, class: hiddenSection ? 'is-hidden' : '' });
  const titleEl = def.custom
    ? h('input.title-input', { value: title, 'aria-label': 'Section title', 'data-field': `title:${id}`, on: { input: (e) => app.edit((d) => { const c = d.custom.find((x) => 'custom:' + x.id === id); c.title = e.target.value; }, { coalesce: 'title' + id }) } })
    : h('h2', title);
  const moreBtn = iconButton('more', `${title} options`, (e) => menu(e.currentTarget, [
    { label: 'Rename on the CV…', onClick: () => app.renameSection(id) },
    { label: hiddenSection ? 'Show on the CV' : 'Hide from the CV', onClick: () => app.edit((d) => { d.layout.hiddenSections = { ...(d.layout.hiddenSections || {}) }; if (hiddenSection) delete d.layout.hiddenSections[id]; else d.layout.hiddenSections[id] = true; }, { refresh: true, label: 'Hide section' }) },
    ...(id !== 'summary' && ['work', 'volunteer', 'education', 'projects'].includes(id) ? [{ label: 'Sort newest first', onClick: () => app.sortSection(id) }] : []),
    'sep',
    { label: id === 'summary' ? 'Clear the summary' : 'Remove this section', danger: true, onClick: () => app.removeSection(id) },
  ], { align: 'right' }));
  card.append(h('header.card-h', grip(`${title} section`), titleEl, hiddenSection ? h('span.badge', 'Hidden') : null, moreBtn));

  if (id === 'summary') {
    card.append(h('div.grid', field(app, 'basics.summary', 'Summary', { hideLabel: true, textarea: true, rows: 4, wide: true, placeholder: SECTIONS.summary.hint, after: wordCount(app.doc.resume.basics.summary) })));
    return card;
  }
  const items = sectionItems(doc, id);
  const list = h('div.entries');
  items.forEach((e, i) => list.append(entryCard(app, id, def, e, i)));
  sortable(list, (from, to) => app.moveItem(id, from, to));
  card.append(list);
  card.append(h('button.link.add-row', { type: 'button', on: { click: () => app.edit((d) => { sectionItems(d, id).push(blankItem(id)); }, { refresh: true, open: itemPath(id, items.length), focus: `${itemPath(id, items.length)}.${def.fields[0].key}`, label: 'Add entry' }) } }, icon('plus', 15), def.add || 'Add'));
  return card;
}

function wordCount(text) {
  const n = (String(text).match(/\S+/g) || []).length;
  return h('small.count', n ? `${n} word${n === 1 ? '' : 's'}` : '');
}

function entryTitle(doc, id, def, e) {
  const v = def.view;
  const get = (k) => (typeof v[k] === 'function' ? v[k](e) : v[k] ? e[v[k]] : '');
  if (id === 'skills') return [e.name, e.keywords.length ? e.keywords.slice(0, 6).join(', ') + (e.keywords.length > 6 ? '…' : '') : ''].filter(Boolean).join(': ') || 'New skill';
  if (id === 'languages') return [e.language, e.fluency].filter(Boolean).join(' – ') || 'New language';
  const main = [get('title'), get('subtitle')].filter(Boolean).join(' · ');
  return main || (def.custom ? 'New entry' : `New ${def.title.toLowerCase().replace(/s$/, '')}`);
}

function entryCard(app, id, def, e, i) {
  const doc = app.doc;
  const path = itemPath(id, i);
  const hidden = !!doc.hidden[path];
  const open = app.open.has(path);
  const v = def.view;
  const dates = v.start ? (v.single ? (e[v.start] ? formatDate(e[v.start], doc.layout.dateFormat) : '') : formatRange(e[v.start], e[v.end], doc.layout.dateFormat)) : '';
  const issues = (app.checksByPath.get(path) || []).length + [...app.checksByPath.keys()].filter((k) => k.startsWith(path + '.')).reduce((n, k) => n + app.checksByPath.get(k).filter((c) => c.level !== 'note').length, 0);
  const card = h('div.entry-card', { 'data-sort': '', 'data-path': path, class: (hidden ? 'is-hidden ' : '') + (open ? 'open' : '') });
  const toggle = h('button.entry-toggle', { type: 'button', 'aria-expanded': String(open), on: { click: () => app.toggleOpen(path) } },
    icon('chevron', 15),
    h('span.entry-sum', h('span.entry-name', entryTitle(doc, id, def, e)), dates ? h('span.entry-dates', dates) : null),
    issues ? h('span.dot-count', { title: `${issues} suggestion${issues > 1 ? 's' : ''}` }, h('span', { 'aria-hidden': 'true' }, String(issues)), h('span.vh', ` ${issues} suggestion${issues > 1 ? 's' : ''}`)) : null);
  const actions = h('div.entry-actions',
    iconButton(hidden ? 'eyeOff' : 'eye', hidden ? 'Hidden from the CV. Show it' : 'Hide from the CV (keeps it here)', () => app.edit((d) => { if (hidden) delete d.hidden[path]; else d.hidden[path] = true; }, { refresh: true, label: hidden ? 'Show entry' : 'Hide entry' })),
    iconButton('more', 'More', (ev) => menu(ev.currentTarget, [
      { label: 'Duplicate', onClick: () => app.edit((d) => { const list = sectionItems(d, id); list.splice(i + 1, 0, JSON.parse(JSON.stringify(list[i]))); shiftHidden(d, id, i + 1, 1); }, { refresh: true, open: itemPath(id, i + 1), label: 'Duplicate' }) },
      { label: 'Move up', disabled: i === 0, onClick: () => app.moveItem(id, i, i - 1) },
      { label: 'Move down', disabled: i === sectionItems(doc, id).length - 1, onClick: () => app.moveItem(id, i, i + 1) },
      'sep',
      { label: 'Delete', danger: true, onClick: () => app.deleteItem(id, i) },
    ], { align: 'right' })),
  );
  card.append(h('div.entry-row', grip(entryTitle(doc, id, def, e)), toggle, actions));
  if (open) card.append(entryFields(app, id, def, e, i));
  return card;
}

/** Keep hidden flags attached to entries when entries are inserted or removed. */
export function shiftHidden(doc, id, from, by) {
  const prefix = itemPath(id, 0).replace(/0$/, '');
  const moved = {};
  for (const [k, val] of Object.entries(doc.hidden)) {
    if (!k.startsWith(prefix)) { moved[k] = val; continue; }
    const rest = k.slice(prefix.length);
    const n = parseInt(rest, 10);
    const tail = rest.slice(String(n).length);
    if (n < from) moved[k] = val;
    else if (by < 0 && n === from) continue;
    else moved[prefix + (n + by) + tail] = val;
  }
  doc.hidden = moved;
}

function entryFields(app, id, def, e, i) {
  const path = itemPath(id, i);
  const box = h('div.entry-fields.grid');
  for (const f of def.fields) {
    const fp = `${path}.${f.key}`;
    if (f.type === 'list') box.append(bulletsField(app, fp, f, e[f.key] || []));
    else if (f.type === 'tags') box.append(tagsField(app, fp, f, e[f.key] || []));
    else if (f.type === 'date') box.append(dateField(app, fp, f, e));
    else if (f.type === 'level' || f.type === 'fluency') {
      const opts = f.type === 'fluency' ? FLUENCY : LEVELS;
      const listId = 'dl-' + f.type;
      if (!document.getElementById(listId)) document.body.append(h('datalist', { id: listId }, opts.map((o) => h('option', { value: o }))));
      const lid = 'f-' + fp.replace(/[^\w]/g, '-');
      const input = h('input', { id: lid, type: 'text', list: listId, value: e[f.key] || '', 'data-field': fp, placeholder: f.type === 'fluency' ? 'Fluent, C1, Basic…' : 'Expert, Advanced… (optional)' });
      input.addEventListener('input', () => app.edit((d) => setPathValue(d, fp, input.value), { coalesce: fp }));
      box.append(h('div.field', h('label', { for: lid }, f.label), input));
    } else box.append(field(app, fp, f.label, { textarea: f.type === 'textarea', rows: 2, wide: f.type === 'textarea', type: f.type === 'url' ? 'url' : 'text', placeholder: f.placeholder, spell: f.type !== 'url' }));
  }
  return box;
}

function dateField(app, fp, f, e) {
  const raw = getPathValue(app.doc, fp) || '';
  // An empty end date means "to the present" (as in JSON Resume). Unticking Ongoing opens the box for a
  // date without writing anything until one is typed.
  const isPresent = f.present && raw === '' && !app.notPresent.has(fp) && (!!e.startDate || app.markedPresent.has(fp));
  const id = 'f-' + fp.replace(/[^\w]/g, '-');
  const input = h('input', { id, type: 'text', 'data-field': fp, value: isPresent ? '' : raw ? (/^\d{4}(-\d{2})?(-\d{2})?$/.test(raw) ? formatDate(raw, 'mon-yyyy') : raw) : '', placeholder: f.present ? 'e.g. Jun 2023' : 'e.g. Mar 2021', disabled: isPresent, inputmode: 'text' });
  const note = h('small.date-note');
  const show = () => {
    const p = parseDate(input.value);
    note.textContent = !input.value.trim() ? '' : p == null ? "Quire can't read that as a date. Try 'Mar 2021' or '2021'." : '';
    note.classList.toggle('bad', !!input.value.trim() && p == null);
  };
  input.addEventListener('input', () => { show(); const p = parseDate(input.value); app.edit((d) => setPathValue(d, fp, p == null ? input.value.trim() : p), { coalesce: fp }); });
  input.addEventListener('blur', () => { const p = parseDate(input.value); if (p) input.value = formatDate(p, 'mon-yyyy'); });
  const out = h('div.field.date', h('label', { for: id }, f.label), input, note);
  if (f.present) {
    const cb = h('input', { type: 'checkbox', checked: isPresent, id: id + '-now', on: { change: () => {
      if (cb.checked) { app.notPresent.delete(fp); app.markedPresent.add(fp); app.edit((d) => setPathValue(d, fp, ''), { refresh: true }); }
      else { app.notPresent.add(fp); app.markedPresent.delete(fp); app.refresh({ focus: fp }); }
    } } });
    out.append(h('label.check', { for: id + '-now' }, cb, f.key === 'endDate' && fp.startsWith('education') ? 'Still studying' : 'Ongoing'));
    if (isPresent || (e.startDate && e.endDate !== undefined)) {
      const len = duration(e.startDate, e.endDate || '');
      if (len && /^\d{4}/.test(e.startDate)) out.append(h('small.date-len', len));
    }
  }
  return out;
}

function bulletsField(app, fp, f, items) {
  const box = h('div.field.wide.bullets', { 'data-path': fp });
  box.append(h('label', f.label));
  const list = h('div.bullet-list');
  const n = items.length;
  items.forEach((text, j) => {
    const bp = `${fp}.${j}`;
    const hidden = !!app.doc.hidden[bp];
    const ta = autosize(h('textarea', { rows: 1, 'data-field': bp, value: text, 'aria-label': `${f.item} ${j + 1}`, placeholder: f.key === 'highlights' ? 'What you did, and what difference it made' : '' }));
    ta.addEventListener('input', () => app.edit((d) => setPathValue(d, bp, ta.value.replace(/\n/g, ' ')), { coalesce: bp }));
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        const at = ta.selectionStart;
        const before = ta.value.slice(0, at), after = ta.value.slice(at);
        app.edit((d) => { const arr = getPathValue(d, fp); arr.splice(j, 1, before, after); shiftBulletHidden(d, fp, j + 1, 1); }, { refresh: true, focus: `${fp}.${j + 1}`, caret: 0, label: 'New point' });
      } else if (ev.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0 && j > 0) {
        ev.preventDefault();
        const prevLen = (getPathValue(app.doc, fp)[j - 1] || '').length;
        app.edit((d) => { const arr = getPathValue(d, fp); arr[j - 1] = (arr[j - 1] + (arr[j - 1] && arr[j] ? ' ' : '') + arr[j]).trimEnd(); arr.splice(j, 1); shiftBulletHidden(d, fp, j, -1); }, { refresh: true, focus: `${fp}.${j - 1}`, caret: prevLen + (prevLen ? 1 : 0), label: 'Join points' });
      } else if (ev.key === 'ArrowUp' && ta.selectionStart === 0 && j > 0) { ev.preventDefault(); focusField(`${fp}.${j - 1}`, 'end'); }
      else if (ev.key === 'ArrowDown' && ta.selectionStart === ta.value.length && j < n - 1) { ev.preventDefault(); focusField(`${fp}.${j + 1}`, 0); }
    });
    ta.addEventListener('paste', (ev) => {
      const t = ev.clipboardData.getData('text');
      if (!/\n/.test(t.trim())) return;
      ev.preventDefault();
      const raw = t.split(/\r?\n/).map((x) => x.replace(/^\s*([•●▪◦‣\-*–]|\d+[.)])\s*/, '').trim());
      const parts = raw.filter(Boolean);
      if (!parts.length) return;
      const at = ta.selectionStart, end = ta.selectionEnd;
      const before = ta.value.slice(0, at), after = ta.value.slice(end);
      // A paste that starts with a line break begins a new point; otherwise its first line joins this one.
      const items = raw[0] === '' && before.trim() ? [before.trimEnd(), ...parts] : [before + parts[0], ...parts.slice(1)];
      if (after.trim()) items[items.length - 1] += after;
      app.edit((d) => { const arr = getPathValue(d, fp); arr.splice(j, 1, ...items); shiftBulletHidden(d, fp, j + 1, items.length - 1); }, { refresh: true, focus: `${fp}.${j + items.length - 1}`, caret: 'end', label: 'Paste points' });
      toast(`Pasted as ${items.length} separate points.`);
    });
    const row = h('div.bullet-row', { 'data-sort': '', class: hidden ? 'is-hidden' : '' },
      grip(`${f.item} ${j + 1}`), h('span.bullet-mark', { 'aria-hidden': 'true' }, '•'), ta,
      app.llmReady() && f.key === 'highlights' ? iconButton('sparkle', 'Suggest a stronger version (local model)', () => app.rewriteBullet(bp), 'ai') : null,
      iconButton(hidden ? 'eyeOff' : 'eye', hidden ? 'Hidden from the CV. Show it' : 'Hide from the CV', () => app.edit((d) => { if (hidden) delete d.hidden[bp]; else d.hidden[bp] = true; }, { refresh: true })),
      iconButton('trash', 'Delete this point', () => app.edit((d) => { getPathValue(d, fp).splice(j, 1); shiftBulletHidden(d, fp, j, -1); }, { refresh: true, label: 'Delete point' })),
    );
    list.append(row);
    const hints = hintsFor(app, bp);
    if (hints) row.append(hints);
  });
  sortable(list, (from, to) => app.edit((d) => { const arr = getPathValue(d, fp); arr.splice(to, 0, arr.splice(from, 1)[0]); moveHidden(d, fp, from, to); }, { refresh: true, label: 'Move point', focusGrip: `${fp}.${to}` }));
  box.append(list);
  box.append(h('button.link.add-row', { type: 'button', on: { click: () => app.edit((d) => { const arr = getPathValue(d, fp); if (!arr) setPathValue(d, fp, ['']); else arr.push(''); }, { refresh: true, focus: `${fp}.${n}` }) } }, icon('plus', 15), `Add ${f.item.toLowerCase()}`));
  return box;
}

function shiftBulletHidden(doc, fp, from, by) {
  const moved = {};
  for (const [k, v] of Object.entries(doc.hidden)) {
    const m = k.startsWith(fp + '.') ? k.slice(fp.length + 1).match(/^(\d+)$/) : null;
    if (!m) { moved[k] = v; continue; }
    const n = +m[1];
    if (n < from) moved[k] = v; else if (by < 0 && n === from) continue; else moved[`${fp}.${n + by}`] = v;
  }
  doc.hidden = moved;
}
function moveHidden(doc, fp, from, to) {
  const flags = [];
  const arr = getPathValue(doc, fp);
  for (let i = 0; i < arr.length; i++) flags.push(!!doc.hidden[`${fp}.${i}`]);
  // flags are for the order before the move; replay the move on them
  const f = flags.splice(from, 1)[0];
  flags.splice(to, 0, f);
  for (let i = 0; i < arr.length; i++) { if (flags[i]) doc.hidden[`${fp}.${i}`] = true; else delete doc.hidden[`${fp}.${i}`]; }
}

function tagsField(app, fp, f, tags) {
  const box = h('div.field.wide.tags-field');
  const id = 'f-' + fp.replace(/[^\w]/g, '-');
  const input = h('input', { id, type: 'text', 'data-field': fp, placeholder: tags.length ? 'Add another…' : 'Type and press Enter, or paste a list', spellcheck: 'true' });
  const chips = h('div.chips', tags.map((t, k) => h('span.chip', t, h('button', { type: 'button', 'aria-label': `Remove ${t}`, on: { click: () => app.edit((d) => getPathValue(d, fp).splice(k, 1), { refresh: true, focus: fp }) } }, icon('close', 12)))), input);
  const commit = (value, keepFocus = true) => {
    const parts = value.split(/\s*[,;|\n]\s*/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    app.edit((d) => { let arr = getPathValue(d, fp); if (!arr) { setPathValue(d, fp, []); arr = getPathValue(d, fp); } for (const p of parts) if (!arr.some((x) => x.toLowerCase() === p.toLowerCase())) arr.push(p); }, { refresh: true, focus: keepFocus ? fp : null, label: 'Add tag' });
  };
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) { e.preventDefault(); commit(input.value); }
    else if (e.key === 'Backspace' && !input.value && tags.length) app.edit((d) => getPathValue(d, fp).pop(), { refresh: true, focus: fp });
  });
  input.addEventListener('paste', (e) => { const t = e.clipboardData.getData('text'); if (/[,;\n|]/.test(t)) { e.preventDefault(); commit(t); } });
  // On leaving the box, keep what was typed without redrawing under the pointer (that would eat the click).
  input.addEventListener('blur', () => {
    if (!input.value.trim()) return;
    const parts = input.value.split(/\s*[,;|\n]\s*/).map((x) => x.trim()).filter(Boolean);
    app.edit((d) => { let arr = getPathValue(d, fp); if (!arr) { setPathValue(d, fp, []); arr = getPathValue(d, fp); } for (const p of parts) if (!arr.some((x) => x.toLowerCase() === p.toLowerCase())) arr.push(p); }, { label: 'Add tag' });
    setTimeout(() => app.refresh(), 250);
  });
  chips.addEventListener('click', (e) => { if (e.target === chips) input.focus(); });
  box.append(h('label', { for: id }, f.label), chips);
  return box;
}

export function focusField(path, caret) {
  const el = document.querySelector(`[data-field="${CSS.escape(path)}"]`);
  if (!el) return false;
  el.focus({ preventScroll: false });
  if (caret != null && 'setSelectionRange' in el && el.type !== 'email' && el.type !== 'url' && el.type !== 'tel' && el.type !== 'checkbox') {
    const at = caret === 'end' ? el.value.length : caret;
    try { el.setSelectionRange(at, at); } catch { /* not supported */ }
  }
  return true;
}
