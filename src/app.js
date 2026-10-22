// Quire: a CV builder that runs entirely in the browser.
// Copyright 2026 The Quire contributors. SPDX-License-Identifier: Apache-2.0
//
// This file holds the state (the open CV, undo history, which entries are open) and wires the panels,
// the live preview, saving, importing and exporting together.

import { h, icon, iconButton, menu, toast, dialog, download, debounce } from './ui/util.js';
import { renderEditor, focusField, shiftHidden, blankItem } from './ui/editor.js';
import { renderDesign } from './ui/design.js';
import { renderReview } from './ui/review.js';
import { renderHome, importReport, versionsDialog } from './ui/home.js';
import { newDoc, toJsonResume, sectionItems, itemPath, sectionDef, syncOrder, uid, sanitizeDoc } from './lib/model.js';
import * as store from './lib/store.js';
import { installFonts, fontsReady } from './render/fonts.js';
import { layoutFitted, PAGE } from './render/paginate.js';
import { look } from './render/templates.js';
import { runChecks, getPathValue, setPathValue, sortSection } from './check/checks.js';
import * as llm from './lib/llm.js';

const $ = (s) => document.querySelector(s);
const HISTORY_MAX = 150;

const app = {
  doc: null,
  view: 'home',
  tab: 'content',
  open: new Set(),
  past: [], future: [],
  checks: [], checksByPath: new Map(),
  pages: 0, fitNote: '',
  zoom: 1,
  mobileView: 'edit',
  notPresent: new Set(), markedPresent: new Set(),
};
window.quire = app; // for tests and the curious

/* ---------- editing and history ---------- */

let lastEdit = { key: null, t: 0 };
app.edit = (fn, opts = {}) => {
  const before = JSON.stringify(app.doc);
  fn(app.doc);
  const after = JSON.stringify(app.doc);
  if (before === after) { if (opts.refresh) app.refresh(opts); return; }
  const now = Date.now();
  const merge = opts.coalesce && lastEdit.key === opts.coalesce && now - lastEdit.t < 1500;
  if (!merge) { app.past.push(before); if (app.past.length > HISTORY_MAX) app.past.shift(); }
  lastEdit = { key: opts.coalesce || null, t: now };
  app.future = [];
  app.doc.updated = now;
  if (opts.open) app.open.add(opts.open);
  save();
  schedulePreview();
  updateUndo();
  if (opts.refresh) app.refresh(opts);
  if (opts.label === 'Change template' || opts.label === 'Restore') renderTopbar();
};

app.undo = () => {
  if (!app.past.length) return;
  app.future.push(JSON.stringify(app.doc));
  app.doc = JSON.parse(app.past.pop());
  lastEdit = { key: null, t: 0 };
  afterJump();
};
app.redo = () => {
  if (!app.future.length) return;
  app.past.push(JSON.stringify(app.doc));
  app.doc = JSON.parse(app.future.pop());
  lastEdit = { key: null, t: 0 };
  afterJump();
};
function afterJump() { app.doc.updated = Date.now(); save(); schedulePreview(0); updateUndo(); app.refresh(); renderTopbar(); }

function updateUndo() {
  const u = $('#undo'), r = $('#redo');
  if (u) u.disabled = !app.past.length;
  if (r) r.disabled = !app.future.length;
}

/* ---------- saving ---------- */

const saveNow = async () => {
  if (!app.doc) return;
  try {
    await store.putDoc(app.doc);
    setStatus('Saved in this browser');
    store.snapshot(app.doc, 'while editing').catch(() => {});
  } catch (e) {
    setStatus('Not saved');
    toast(`Couldn't save to this browser's storage (${e.message || e}). Download a JSON copy to be safe.`, { ms: 9000 });
  }
};
const save = debounce(saveNow, 350);
function setStatus(t) { const s = $('#save-status'); if (s) s.textContent = t; }
window.addEventListener('pagehide', () => save.flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save.flush(); });

/* ---------- panels ---------- */

app.refresh = (opts = {}) => {
  if (app.view !== 'edit') return;
  const panel = $('#panel');
  const scroller = $('#panel-scroll');
  const top = scroller.scrollTop;
  const active = document.activeElement;
  const field = active && active.dataset ? active.dataset.field : null;
  const sel = field && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  if (app.tab === 'content') renderEditor(app, panel);
  else if (app.tab === 'design') renderDesign(app, panel);
  else renderReview(app, panel);
  scroller.scrollTop = top;
  if (opts.focus) requestAnimationFrame(() => { focusField(opts.focus, opts.caret ?? 'end'); });
  else if (opts.focusGrip) requestAnimationFrame(() => { const g = document.querySelector(`[data-path="${CSS.escape(opts.focusGrip)}"] .grip`); if (g) g.focus(); });
  else if (field) {
    const el = document.querySelector(`[data-field="${CSS.escape(field)}"]`);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch { /* fine */ } }
  }
  for (const b of document.querySelectorAll('.tabs [data-tab]')) { b.setAttribute('aria-selected', String(b.dataset.tab === app.tab)); b.tabIndex = b.dataset.tab === app.tab ? 0 : -1; }
  scroller.setAttribute('aria-labelledby', 'tab-' + app.tab);
  updateReviewBadge();
};

app.setTab = (tab) => { app.tab = tab; app.refresh(); $('#panel-scroll').scrollTop = 0; if (app.mobileView === 'preview') setMobile('edit'); };
app.toggleOpen = (path) => { if (app.open.has(path)) app.open.delete(path); else app.open.add(path); app.refresh(); };
app.llmReady = () => llm.loaded();

/** Show something in the editor: open its entry, focus its field, scroll to it. */
app.jumpTo = (path) => {
  if (!path) return;
  if (path === 'job') { app.setTab('review'); return; }
  app.tab = 'content';
  setMobile('edit');
  const m = path.match(/^((?:custom:[^.]+|\w+)\.\d+)/);
  if (m && !path.startsWith('basics')) app.open.add(m[1]);
  app.refresh();
  requestAnimationFrame(() => {
    const target = document.querySelector(`[data-field="${CSS.escape(path)}"]`) || document.querySelector(`#panel [data-path="${CSS.escape(path)}"]`) || (m && document.querySelector(`#panel [data-path="${CSS.escape(m[1])}"]`)) || document.querySelector(`#panel [data-path="${CSS.escape(path.split('.').slice(0, 2).join('.'))}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (target.matches('input, textarea, select')) target.focus({ preventScroll: true });
    else { const f = target.querySelector('input, textarea'); if (f) f.focus({ preventScroll: true }); }
    const host = target.closest('.field, .entry-card, .card, .bullet-row') || target;
    host.classList.remove('flash'); void host.offsetWidth; host.classList.add('flash');
  });
};
app.scrollTo = (path) => requestAnimationFrame(() => { const el = document.querySelector(`#panel [data-path="${CSS.escape(path)}"]`); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); });

app.applyFix = (c) => { app.edit((d) => c.fix.run(d), { refresh: true, label: c.fix.label }); toast(`Done: ${c.fix.label.toLowerCase()}.`, { action: 'Undo', onAction: app.undo }); };
app.sortSection = (id) => app.edit((d) => sortSection(d, id), { refresh: true, label: 'Sort' });
app.moveItem = (id, from, to) => {
  if (to < 0 || to >= sectionItems(app.doc, id).length) return;
  app.edit((d) => {
    const list = sectionItems(d, id);
    // Carry hidden flags (and the open state) with the entries.
    const flags = list.map((e, i) => Object.entries(d.hidden).filter(([k]) => k === itemPath(id, i) || k.startsWith(itemPath(id, i) + '.')).map(([k, v]) => [k.slice(itemPath(id, i).length), v]));
    const openFlags = list.map((e, i) => app.open.has(itemPath(id, i)));
    list.splice(to, 0, list.splice(from, 1)[0]);
    flags.splice(to, 0, flags.splice(from, 1)[0]);
    openFlags.splice(to, 0, openFlags.splice(from, 1)[0]);
    const prefix = itemPath(id, 0).replace(/0$/, '');
    for (const k of Object.keys(d.hidden)) if (k.startsWith(prefix)) delete d.hidden[k];
    flags.forEach((fl, i) => { for (const [suffix, v] of fl) d.hidden[itemPath(id, i) + suffix] = v; });
    openFlags.forEach((o, i) => { if (o) app.open.add(itemPath(id, i)); else app.open.delete(itemPath(id, i)); });
  }, { refresh: true, label: 'Move', focusGrip: itemPath(id, to) });
};
app.deleteItem = (id, i) => {
  app.edit((d) => { sectionItems(d, id).splice(i, 1); shiftHidden(d, id, i, -1); }, { refresh: true, label: 'Delete' });
  toast('Deleted.', { action: 'Undo', onAction: app.undo });
};
app.removeSection = (id) => {
  app.edit((d) => {
    if (id === 'summary') { d.resume.basics.summary = ''; return; }
    if (id.startsWith('custom:')) { d.custom = d.custom.filter((c) => 'custom:' + c.id !== id); syncOrder(d); }
    else { sectionItems(d, id).splice(0); if (d.layout.added) delete d.layout.added[id]; }
    const prefix = id.startsWith('custom:') ? id + '.' : (sectionDef(id, d).key || id) + '.';
    for (const k of Object.keys(d.hidden)) if (k.startsWith(prefix)) delete d.hidden[k];
  }, { refresh: true, label: 'Remove section' });
  toast('Section removed.', { action: 'Undo', onAction: app.undo });
};
app.renameSection = (id) => {
  const def = sectionDef(id, app.doc);
  const input = h('input', { value: app.doc.layout.titles[id] || def.title, 'aria-label': 'Section title' });
  const d = dialog('Rename section', [h('p.hint', `What this section is called on your CV. Common alternatives: ${altTitles(id)}.`), input], {
    actions: [h('button.ghost', { type: 'button', on: { click: () => d.close() } }, 'Cancel'), h('button', { type: 'button', on: { click: () => { const v = input.value.trim(); app.edit((doc) => { if (id.startsWith('custom:')) doc.custom.find((c) => 'custom:' + c.id === id).title = v || 'Section'; else if (!v || v === def.title) delete doc.layout.titles[id]; else doc.layout.titles[id] = v; }, { refresh: true }); d.close(); } } }, 'Rename')],
  });
  input.select();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') d.el.querySelector('footer button:last-child').click(); });
};
function altTitles(id) {
  return ({ work: 'Work experience, Employment history, Career history', summary: 'Profile, Personal statement, About me', skills: 'Key skills, Technical skills, Expertise', education: 'Education and qualifications, Qualifications', projects: 'Selected projects, Portfolio', certificates: 'Certificates, Licences, Training', interests: 'Hobbies, Outside work', volunteer: 'Voluntary work, Community' }[id]) || 'anything you like';
}
app.addSkill = (label) => {
  app.edit((d) => {
    const s = d.resume.skills;
    const target = s.find((x) => x.keywords.length) || null;
    if (target) { if (!target.keywords.some((k) => k.toLowerCase() === label.toLowerCase())) target.keywords.push(label); } else s.push({ name: label, level: '', keywords: [] });
    d.layout.added = { ...(d.layout.added || {}), skills: true };
  }, { refresh: true, label: 'Add skill' });
  toast(`Added "${label}" to your skills. Only keep it if it's true.`, { action: 'Undo', onAction: app.undo });
};
app.tailoredCopy = async (title) => {
  const copy = JSON.parse(JSON.stringify(app.doc));
  copy.id = uid();
  copy.name = `${app.doc.resume.basics.name ? app.doc.resume.basics.name + ' – ' : ''}${title || 'tailored copy'}`;
  copy.created = copy.updated = Date.now();
  await store.putDoc(copy);
  await app.openDoc(copy.id);
  toast('This is a copy for that job. Your original CV is unchanged.');
};
app.rewriteBullet = async (path) => {
  const original = getPathValue(app.doc, path);
  const entryPath = path.split('.').slice(0, 2).join('.');
  const e = getPathValue(app.doc, entryPath) || {};
  const ctx = [e.position, e.name, e.endDate === '' ? '(current job)' : '(past job)'].filter(Boolean).join(', ');
  const out = h('p.ai-line', 'Thinking…');
  const dlg = dialog('A stronger version?', [h('p.hint', 'From the language model on this device. Check it says only what\'s true.'), h('p.orig', original), out], {
    actions: [h('button.ghost', { type: 'button', on: { click: () => { llm.stop(); dlg.close(); } } }, 'Keep mine'), h('button#use-ai', { type: 'button', disabled: true, on: { click: () => { app.edit((d) => setPathValue(d, path, out.textContent), { refresh: true, label: 'Use suggestion' }); dlg.close(); } } }, 'Use this')],
  });
  try {
    const text = await llm.rewriteBullet(original, ctx, (t) => { out.textContent = t.split('\n')[0]; });
    out.textContent = text;
    const use = dlg.el.querySelector('#use-ai');
    if (use) use.disabled = !text;
  } catch (err) { out.textContent = String(err.message || err); }
};

/* ---------- preview ---------- */

let previewTimer = 0;
function schedulePreview(ms) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, ms ?? (app.doc && app.doc.layout.fit ? 260 : 120));
}

async function renderPreview() {
  if (app.view !== 'edit' || !app.doc) return;
  await fontsReady(look(app.doc).font);
  const stage = $('#pages');
  const r = layoutFitted(app.doc, stage);
  app.pages = r.pages;
  const L = app.doc.layout;
  app.fitNote = !L.fit ? '' : r.tooLong ? `This CV needs ${r.natural} pages even at the smallest size, so Fit to ${L.fit} page${L.fit > 1 ? 's' : ''} isn't possible. Hide or shorten something.` : r.natural > L.fit ? `Shrunk to ${Math.round(r.scale * 100)}% to fit on ${L.fit} page${L.fit > 1 ? 's' : ''}.` : `Already fits on ${L.fit} page${L.fit > 1 ? 's' : ''}.`;
  $('#page-info').textContent = `${r.pages} page${r.pages > 1 ? 's' : ''} · ${L.size === 'Letter' ? 'US Letter' : 'A4'}${L.fit && r.natural > L.fit && !r.tooLong ? ` · fitted (${Math.round(r.scale * 100)}%)` : ''}`;
  scalePreview();
  // Checks need the page count.
  app.checks = runChecks(app.doc, { pages: r.pages });
  app.checksByPath = new Map();
  for (const c of app.checks) if (c.path && !(app.doc.ignored || {})[c.key]) { if (!app.checksByPath.has(c.path)) app.checksByPath.set(c.path, []); app.checksByPath.get(c.path).push(c); }
  updateReviewBadge();
  if (app.tab === 'review' && !$('#panel').contains(document.activeElement)) app.refresh();
  else if (app.tab === 'content') updateInlineHints();
  else if (app.tab === 'design') { const note = $('#panel .fit-note'); if (note) note.textContent = app.fitNote; }
}

function updateInlineHints() {
  // Only the hints change while typing, so swap them in place rather than redrawing the form.
  {
    for (const el of document.querySelectorAll('#panel [data-field]')) {
      const host = el.closest('.bullet-row') || el.closest('.field');
      if (!host) continue;
      const old = host.querySelector(':scope > .inline-hints');
      const list = (app.checksByPath.get(el.dataset.field) || []).filter((c) => c.level !== 'note');
      if (!list.length) { if (old) old.remove(); continue; }
      const fresh = h('div.inline-hints', list.map((c) => h('p.inline-hint', { class: c.level }, icon('pen', 13), h('span', c.title), c.fix ? h('button.link', { type: 'button', on: { click: () => app.applyFix(c) } }, c.fix.label) : null)));
      if (old) old.replaceWith(fresh); else host.append(fresh);
    }
  }
}

function updateReviewBadge() {
  const b = $('#review-count');
  if (!b) return;
  const n = app.checks.filter((c) => c.level !== 'note' && !(app.doc.ignored || {})[c.key]).length;
  b.textContent = n ? String(n) : '';
  b.hidden = !n;
}

function scalePreview() {
  const stage = $('#pages');
  const root = stage.firstElementChild;
  if (!root) return;
  const avail = $('#preview-scroll').clientWidth - 48;
  const page = root.querySelector('.page');
  const pw = page.offsetWidth;
  const fit = Math.min(1.3, avail / pw);
  const s = Math.max(0.2, fit * app.zoom);
  root.style.transform = `scale(${s})`;
  root.style.transformOrigin = 'top left';
  stage.style.width = pw * s + 'px';
  stage.style.height = root.offsetHeight * s + 'px';
  $('#zoom-level').textContent = `${Math.round(app.zoom * 100)}%`;
}
window.addEventListener('resize', debounce(() => { if (app.view === 'edit') scalePreview(); }, 80));

/* ---------- documents ---------- */

app.openDoc = async (id) => {
  const d = await store.getDoc(id);
  if (!d) { toast('That CV is no longer in this browser.'); return showHome(); }
  await save.flush();
  app.doc = migrate(d);
  app.past = []; app.future = []; app.open = new Set(); app.notPresent = new Set(); app.markedPresent = new Set();
  lastEdit = { key: null, t: 0 };
  app.view = 'edit';
  await store.setSetting('last', id).catch(() => {});
  history.replaceState(null, '', '#cv=' + id);
  renderShell();
  store.snapshot(app.doc, 'opened').catch(() => {});
};

const migrate = (d) => sanitizeDoc(d);

async function startWith(doc, message) {
  await store.putDoc(doc);
  await store.snapshot(doc, 'created', true).catch(() => {});
  await app.openDoc(doc.id);
  if (message) toast(message);
}

app.createBlank = () => {
  const d = newDoc();
  d.layout.added = { work: true, education: true, skills: true };
  d.resume.work.push(blankItem('work'));
  d.resume.education.push(blankItem('education'));
  d.resume.skills.push({ name: 'Skills', level: '', keywords: [] });
  d.name = 'My CV';
  app.open.clear();
  startWith(d).then(() => { app.open.add('work.0'); app.refresh(); focusField('basics.name'); });
};
app.createExample = async () => {
  const j = await (await fetch(new URL('./examples/example.json', import.meta.url))).json();
  const d = newDoc(j, { name: 'Example: Priya Shah' });
  startWith(d, 'This is a made-up example. Try the Design and Review tabs.');
};
app.importFiles = async (files) => {
  const file = files[0];
  if (!file) return;
  const busy = toastBusy(`Reading ${file.name}…`);
  try {
    const { importFile } = await import('./import/index.js');
    const result = await importFile(file);
    busy();
    await startWith(result.doc);
    if (result.exact) toast(`Opened ${file.name} exactly as it was saved from Quire.`);
    else if (!result.guessed) toast(`Imported from ${result.formatName}.`);
    importReport(app, result);
  } catch (e) {
    busy();
    console.error(e);
    toast(e.message || `Couldn't read ${file.name}.`, { ms: 9000 });
  }
};
app.pasteText = () => {
  const ta = h('textarea', { rows: 14, placeholder: 'Paste the text of your CV here. Headings like Experience, Education and Skills help Quire find its way around.', 'aria-label': 'CV text' });
  const d = dialog('Paste your CV', [ta], { wide: true, actions: [h('button.ghost', { type: 'button', on: { click: () => d.close() } }, 'Cancel'), h('button', { type: 'button', on: { click: async () => {
    if (!ta.value.trim()) return;
    const { importText } = await import('./import/index.js');
    const result = importText(ta.value);
    d.close();
    await startWith(result.doc);
    importReport(app, result);
  } } }, 'Import')] });
  ta.focus();
};
app.restoreSnapshot = async (s) => {
  await store.snapshot(app.doc, 'before restoring', true);
  app.past.push(JSON.stringify(app.doc));
  app.future = [];
  app.doc = migrate({ ...s.doc, id: app.doc.id });
  afterJump();
  toast(`Restored the version from ${new Date(s.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`, { action: 'Undo', onAction: app.undo });
};

function toastBusy(msg) {
  const el = h('div.busy', { role: 'status' }, h('span.spinner'), msg);
  document.body.append(el);
  return () => el.remove();
}

/* ---------- exporting ---------- */

const fileBase = () => (app.doc.resume.basics.name || 'CV').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') + '-CV';

/** Lay the CV out unscaled, off screen, for the PDF writer and printing. */
async function renderClean(host) {
  await fontsReady(look(app.doc).font);
  layoutFitted(app.doc, host);
  await Promise.all([...host.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  return [...host.querySelectorAll('.page')];
}

app.exportPdf = async () => {
  const done = toastBusy('Making your PDF…');
  const host = h('div.offscreen');
  document.body.append(host);
  try {
    const pages = await renderClean(host);
    const { pagesToPdf } = await import('./export/pdf.js');
    const b = app.doc.resume.basics;
    const bytes = await pagesToPdf(pages, app.doc.layout.size, {
      meta: { title: `${b.name || 'CV'}${b.label ? ' – ' + b.label : ''}`, author: b.name, subject: 'CV', keywords: app.doc.resume.skills.flatMap((s) => (s.keywords.length ? s.keywords : [s.name])).join(', '), lang: 'en-GB' },
      attachment: toJsonResume(app.doc),
    });
    download(new Blob([bytes], { type: 'application/pdf' }), fileBase() + '.pdf');
    toast(`Downloaded ${fileBase()}.pdf (${Math.max(1, Math.round(bytes.length / 1024))} KB).`);
  } catch (e) {
    console.error(e);
    toast(`Couldn't make the PDF (${e.message || e}). Print and choose "Save as PDF" instead.`, { action: 'Print', onAction: app.print, ms: 9000 });
  } finally { host.remove(); done(); }
};
app.exportDocx = async () => {
  const { toDocx } = await import('./export/docx.js');
  download(await toDocx(app.doc), fileBase() + '.docx');
  toast('Downloaded a Word version. It uses Calibri or Cambria so it looks right in any copy of Word.');
};
app.exportJson = () => {
  download(new Blob([JSON.stringify(toJsonResume(app.doc), null, 2)], { type: 'application/json' }), fileBase() + '.json');
  toast('Downloaded as JSON Resume. Import it into Quire on any device to carry on, or use it with other JSON Resume tools.');
};
app.exportText = async (markdown) => {
  const { toText } = await import('./export/text.js');
  download(new Blob([toText(app.doc, { markdown })], { type: markdown ? 'text/markdown' : 'text/plain' }), fileBase() + (markdown ? '.md' : '.txt'));
};
app.copyText = async () => {
  const { toText } = await import('./export/text.js');
  try { await navigator.clipboard.writeText(toText(app.doc)); toast('Copied as plain text, ready to paste into an application form.'); } catch { toast("Couldn't copy. Use Download as text instead."); }
};
app.print = async () => {
  const host = $('#print-root');
  await renderClean(host);
  const size = PAGE[app.doc.layout.size];
  let st = $('#print-size');
  if (!st) { st = h('style#print-size'); document.head.append(st); }
  st.textContent = `@page { size: ${size.w} ${size.h}; margin: 0; }`;
  window.print();
};
window.addEventListener('afterprint', () => { const p = $('#print-root'); if (p) p.replaceChildren(); });

/* ---------- the shell ---------- */

function renderTopbar() {
  const bar = $('#bar-doc');
  if (!bar) return;
  if (app.view !== 'edit') { bar.replaceChildren(); return; }
  const docBtn = h('button.doc-switch', { type: 'button', 'aria-haspopup': 'menu', on: { click: (e) => docMenu(e.currentTarget) } }, h('span', app.doc.name || 'Untitled CV'), icon('down', 16));
  bar.replaceChildren(docBtn, h('span#save-status.status', { 'aria-live': 'polite' }, 'Saved in this browser'));
}

async function docMenu(anchor) {
  const docs = await store.listDocs();
  menu(anchor, [
    { heading: 'Your CVs' },
    ...docs.slice(0, 8).map((d) => ({ label: d.name || 'Untitled CV', current: d.id === app.doc.id, hint: d.id === app.doc.id ? 'open now' : undefined, onClick: () => d.id !== app.doc.id && app.openDoc(d.id) })),
    { label: 'All CVs and new…', onClick: showHome },
    'sep',
    { label: 'Rename…', onClick: renameDoc },
    { label: 'Duplicate', onClick: () => app.tailoredCopy('copy') },
    { label: 'Earlier versions…', onClick: () => versionsDialog(app) },
    'sep',
    { label: 'Delete this CV…', danger: true, onClick: deleteDoc },
  ]);
}

function renameDoc() {
  const input = h('input', { value: app.doc.name, 'aria-label': 'Name' });
  const d = dialog('Rename', [h('p.hint', 'Only you see this name (for example "CV for data jobs").'), input], { actions: [h('button.ghost', { type: 'button', on: { click: () => d.close() } }, 'Cancel'), h('button', { type: 'button', on: { click: () => { app.edit((doc) => { doc.name = input.value.trim() || 'Untitled CV'; }); renderTopbar(); d.close(); } } }, 'Rename')] });
  input.select();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') d.el.querySelector('footer button:last-child').click(); });
}

function deleteDoc() {
  const d = dialog('Delete this CV?', [h('p', `"${app.doc.name}" and its earlier versions will be removed from this browser. This can't be undone, so download a copy first if you might want it.`)], {
    actions: [h('button.ghost', { type: 'button', on: { click: () => d.close() } }, 'Keep it'), h('button.danger', { type: 'button', on: { click: async () => { d.close(); save.cancel(); await store.deleteDoc(app.doc.id); app.doc = null; toast('Deleted.'); showHome(); } } }, 'Delete')],
  });
}

async function showHome() {
  await save.flush();
  app.view = 'home';
  history.replaceState(null, '', location.pathname + location.search);
  const docs = await store.listDocs();
  $('#app').className = 'view-home';
  renderTopbar();
  $('#bar-actions').replaceChildren(themeButton());
  renderHome(app, $('#main'), docs);
}

function renderShell() {
  $('#app').className = 'view-edit';
  renderTopbar();
  const importInput = h('input.vh#import-bar', { type: 'file', accept: '.pdf,.docx,.odt,.json,.txt,.md,.rtf,.zip', on: { change: (e) => { if (e.target.files[0]) app.importFiles(e.target.files); e.target.value = ''; } } });
  const exportBtn = h('button.primary', { type: 'button', 'aria-haspopup': 'menu', on: { click: (e) => menu(e.currentTarget, [
    { label: 'PDF', hint: 'Best for sending. Text stays selectable.', onClick: app.exportPdf },
    { label: 'Word (.docx)', hint: 'For editing elsewhere or forms that want Word', onClick: app.exportDocx },
    { label: 'JSON Resume', hint: 'Everything, to back up or move devices', onClick: app.exportJson },
    { label: 'Plain text', onClick: () => app.exportText(false) },
    { label: 'Markdown', onClick: () => app.exportText(true) },
    'sep',
    { label: 'Copy as text', hint: 'For application forms', onClick: app.copyText },
    { label: 'Print…', onClick: app.print },
  ], { align: 'right' }) } }, icon('download', 17), h('span', 'Download'));
  $('#bar-actions').replaceChildren(
    h('button#undo.icon', { type: 'button', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', disabled: true, on: { click: app.undo } }, icon('undo')),
    h('button#redo.icon', { type: 'button', 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', disabled: true, on: { click: app.redo } }, icon('redo')),
    h('label.ghost.btn', { for: 'import-bar', title: 'Import a CV (PDF, Word, JSON, LinkedIn export)' }, icon('upload', 17), h('span', 'Import')), importInput,
    exportBtn, themeButton());
  const tabs = h('nav.tabs', { role: 'tablist', 'aria-label': 'Editing' },
    [['content', 'Content'], ['design', 'Design'], ['review', 'Review']].map(([id, label]) => h('button', { type: 'button', role: 'tab', id: 'tab-' + id, 'aria-controls': 'panel-scroll', 'data-tab': id, 'aria-selected': String(app.tab === id), tabindex: app.tab === id ? '0' : '-1', on: { click: () => app.setTab(id) } }, label, id === 'review' ? h('span#review-count.count-badge', { hidden: true }) : null)));
  const previewBar = h('div.preview-bar',
    h('span#page-info.page-info'),
    h('div.zoom', iconButton('zoomOut', 'Zoom out', () => { app.zoom = Math.max(0.5, +(app.zoom - 0.1).toFixed(2)); scalePreview(); }), h('span#zoom-level.zoom-level', '100%'), iconButton('zoomIn', 'Zoom in', () => { app.zoom = Math.min(2, +(app.zoom + 0.1).toFixed(2)); scalePreview(); })));
  let hovered = null;
  const pages = h('div#pages.pages', { on: {
    click: onPreviewClick,
    mouseover: (e) => { const t = e.target.closest('[data-path]'); if (t === hovered) return; if (hovered) hovered.classList.remove('hover-target'); hovered = t; if (t) t.classList.add('hover-target'); },
    mouseleave: () => { if (hovered) hovered.classList.remove('hover-target'); hovered = null; },
  } });
  $('#main').replaceChildren(
    h('div.workspace',
      h('aside.panel-wrap', { 'aria-label': 'Editor' }, tabs, h('div#panel-scroll.scroll', { role: 'tabpanel', 'aria-labelledby': 'tab-' + app.tab }, h('div#panel.panel'))),
      h('section.preview', { 'aria-label': 'Preview' }, previewBar, h('div#preview-scroll.scroll.preview-scroll', pages))),
    h('nav.mobile-switch', { 'aria-label': 'Switch view' },
      h('button', { type: 'button', 'data-m': 'edit', on: { click: () => setMobile('edit') } }, icon('pen', 16), 'Edit'),
      h('button', { type: 'button', 'data-m': 'preview', on: { click: () => setMobile('preview') } }, icon('eye', 16), 'Preview')));
  setMobile(app.mobileView);
  app.refresh();
  updateUndo();
  schedulePreview(0);
}

function setMobile(v) {
  app.mobileView = v;
  const ws = document.querySelector('.workspace');
  if (ws) ws.dataset.mobile = v;
  for (const b of document.querySelectorAll('.mobile-switch button')) b.setAttribute('aria-pressed', String(b.dataset.m === v));
  if (v === 'preview') requestAnimationFrame(scalePreview);
}

function onPreviewClick(e) {
  const a = e.target.closest('a');
  if (a) e.preventDefault();
  const el = e.target.closest('[data-path]');
  if (!el) return;
  const path = el.dataset.path;
  if (path.startsWith('section:')) { app.tab = 'content'; setMobile('edit'); app.refresh(); app.scrollTo(path); return; }
  if (path === 'basics') { app.jumpTo('basics.name'); return; }
  app.jumpTo(path);
}

function themeButton() {
  const cur = localStorage.getItem('quire-theme') || 'auto';
  const next = { auto: 'light', light: 'dark', dark: 'auto' }[cur];
  const label = { auto: 'Theme: match my device', light: 'Theme: light', dark: 'Theme: dark' }[cur];
  return h('button.icon', { type: 'button', 'aria-label': label, title: label, on: { click: (e) => { setTheme(next); e.currentTarget.replaceWith(themeButton()); } } }, icon('theme'));
}
function setTheme(t) {
  try { localStorage.setItem('quire-theme', t); } catch { /* private mode */ }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
}

/* ---------- keyboard, drag and drop anywhere ---------- */

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || app.view !== 'edit') return;
  const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable]');
  const k = e.key.toLowerCase();
  if (k === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) app.redo(); else app.undo(); }
  else if (k === 'y' && !typing) { e.preventDefault(); app.redo(); }
  else if (k === 's') { e.preventDefault(); save.flush(); toast('Quire saves as you type. Use Download to get a file.'); }
  else if (k === 'p') { e.preventDefault(); app.print(); }
});
document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
document.addEventListener('drop', (e) => {
  document.body.classList.remove('dropping');
  if (!e.dataTransfer || !e.dataTransfer.files.length) return;
  e.preventDefault();
  app.importFiles(e.dataTransfer.files);
});

/* ---------- start ---------- */

async function start() {
  setTheme(localStorage.getItem('quire-theme') || 'auto');
  installFonts();
  store.persist();
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/[?&]nosw\b/.test(location.search)) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Files opened with Quire as an installed app.
  if ('launchQueue' in window) window.launchQueue.setConsumer(async (params) => { if (params.files && params.files.length) app.importFiles([await params.files[0].getFile()]); });
  const m = location.hash.match(/cv=([\w-]+)/);
  if (m && await store.getDoc(m[1])) return app.openDoc(m[1]);
  const docs = await store.listDocs();
  const last = await store.getSetting('last').catch(() => null);
  if (docs.length && last && docs.some((d) => d.id === last) && !/[?&]home\b/.test(location.search)) return app.openDoc(last);
  showHome();
}

$('#brand').addEventListener('click', (e) => { e.preventDefault(); showHome(); });
start().catch((e) => { console.error(e); toast(`Quire couldn't start: ${e.message || e}`, { ms: 10000 }); });

export default app;
