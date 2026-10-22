// Small DOM helpers shared by the interface.

/** h('div.class#id', {attrs, on:{click}}, ...children) */
export function h(spec, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) { children.unshift(attrs); attrs = {}; }
  const m = String(spec).match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) part[0] === '.' ? el.classList.add(part.slice(1)) : (el.id = part.slice(1));
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false && c !== '') el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const PATHS = {
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.3-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="2"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  chevron: '<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  down: '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  redo: '<path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  more: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>',
  close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor"/>',
  theme: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  zoomIn: '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4M8 11h6M11 8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  zoomOut: '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4M8 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
};

export function icon(name, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', 'currentColor');
  s.innerHTML = PATHS[name] || '';
  return s;
}

/** An icon-only button with an accessible name and tooltip. */
export function iconButton(name, label, onClick, cls = '') {
  return h('button.icon' + (cls ? '.' + cls : ''), { type: 'button', 'aria-label': label, title: label, on: { click: onClick } }, icon(name));
}

let toastTimer = 0;
export function toast(message, { action, onAction, ms = 4200 } = {}) {
  let el = document.getElementById('toast');
  if (!el) { el = h('div#toast.toast', { role: 'status', 'aria-live': 'polite' }); document.body.append(el); }
  el.replaceChildren(h('span', message));
  if (action) el.append(h('button.link', { type: 'button', on: { click: () => { el.classList.remove('on'); onAction(); } } }, action));
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}

/** A popover menu anchored to a button. items: [{label, onClick, danger, hint}] or 'sep'. */
export function menu(anchor, items, { align = 'left' } = {}) {
  closeMenus();
  const m = h('div.menu', { role: 'menu' });
  for (const it of items) {
    if (it === 'sep') { m.append(h('hr')); continue; }
    if (it.heading) { m.append(h('p.menu-h', it.heading)); continue; }
    m.append(h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : it.current ? 'current' : '', disabled: it.disabled, on: { click: () => { closeMenus(); if (anchor.isConnected) anchor.focus(); it.onClick(); } } }, h('span', it.label), it.hint ? h('small', it.hint) : null));
  }
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const mw = Math.min(320, window.innerWidth - 16);
  m.style.minWidth = Math.max(200, Math.min(r.width, mw)) + 'px';
  m.style.maxWidth = mw + 'px';
  const left = align === 'right' ? Math.max(8, r.right - m.offsetWidth) : Math.min(r.left, window.innerWidth - m.offsetWidth - 8);
  m.style.left = left + 'px';
  const below = r.bottom + 6;
  m.style.top = (below + m.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - m.offsetHeight - 6) : below) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  const first = m.querySelector('button:not(:disabled)');
  if (first) first.focus();
  const onKey = (e) => {
    const btns = [...m.querySelectorAll('button:not(:disabled)')];
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') { closeMenus(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  };
  m.addEventListener('keydown', onKey);
  setTimeout(() => document.addEventListener('pointerdown', outside), 0);
  function outside(e) { if (!m.contains(e.target)) closeMenus(); }
  m._cleanup = () => { document.removeEventListener('pointerdown', outside); anchor.setAttribute('aria-expanded', 'false'); };
  return m;
}
/** Arrow keys move between the options of a radio group or the tabs of a tab list (and choose them). */
document.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const item = e.target.closest && e.target.closest('[role="radio"], [role="tab"]');
  if (!item || item.tagName === 'INPUT') return;
  const group = item.closest('[role="radiogroup"], [role="tablist"]');
  if (!group) return;
  const items = [...group.querySelectorAll('[role="radio"], [role="tab"]')].filter((x) => x.closest('[role="radiogroup"], [role="tablist"]') === group && !x.disabled);
  const i = items.indexOf(item);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
  e.preventDefault();
  const target = items[next];
  target.click();
  // The click may redraw the group; focus whatever now stands in that place.
  requestAnimationFrame(() => {
    const label = target.getAttribute('aria-label') || target.textContent;
    const again = target.isConnected ? target : [...document.querySelectorAll(`[role="${target.getAttribute('role')}"]`)].find((x) => (x.getAttribute('aria-label') || x.textContent) === label);
    if (again) again.focus();
  });
});

export function closeMenus() { for (const m of document.querySelectorAll('.menu')) { m._cleanup && m._cleanup(); m.remove(); } }

/** A modal dialog. Returns { el, close }. */
export function dialog(title, body, { actions = [], wide = false, onClose } = {}) {
  const d = h('dialog.dlg' + (wide ? '.wide' : ''), { 'aria-label': title },
    h('header.dlg-h', h('h2', title), iconButton('close', 'Close', () => close())),
    h('div.dlg-b', body),
    actions.length ? h('footer.dlg-f', actions) : null);
  document.body.append(d);
  d.showModal();
  d.addEventListener('close', () => { d.remove(); onClose && onClose(); });
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  function close() { if (d.open) d.close(); }
  return { el: d, close };
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export const debounce = (fn, ms) => { let t = 0; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; d.cancel = () => clearTimeout(t); return d; };

/** Textareas that grow with their content. */
export function autosize(t) {
  const fit = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; };
  t.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return t;
}

export function relTime(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} days ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Drag to reorder children of a list (pointer and keyboard). onMove(from, to). Handles are [data-grip]. */
export function sortable(list, onMove, { item = ':scope > [data-sort]' } = {}) {
  let drag = null;
  list.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || !list.contains(grip)) return;
    const el = grip.closest('[data-sort]');
    if (!el || el.parentElement !== list) return;
    e.preventDefault();
    const items = [...list.querySelectorAll(item)];
    const from = items.indexOf(el);
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.style.width = r.width + 'px';
    ghost.style.left = r.left + 'px';
    ghost.style.top = r.top + 'px';
    document.body.append(ghost);
    el.classList.add('dragging');
    drag = { el, from, to: from, ghost, dy: e.clientY - r.top, items };
    grip.setPointerCapture(e.pointerId);
    const move = (ev) => {
      ghost.style.top = ev.clientY - drag.dy + 'px';
      const n = drag.items.length;
      let ins = n;
      for (let i = 0; i < n; i++) { const ir = drag.items[i].getBoundingClientRect(); if (ev.clientY < ir.top + ir.height / 2) { ins = i; break; } }
      drag.to = ins > drag.from ? ins - 1 : ins;
      for (const it of drag.items) it.classList.remove('drop-before', 'drop-after');
      if (ins < n) drag.items[ins].classList.add('drop-before'); else drag.items[n - 1].classList.add('drop-after');
      const sc = list.closest('.scroll');
      if (sc) { const sr = sc.getBoundingClientRect(); if (ev.clientY < sr.top + 40) sc.scrollTop -= 12; if (ev.clientY > sr.bottom - 40) sc.scrollTop += 12; }
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      ghost.remove();
      el.classList.remove('dragging');
      for (const it of drag.items) it.classList.remove('drop-before', 'drop-after');
      const { from: f, to: t } = drag;
      drag = null;
      if (t !== f && t >= 0) onMove(f, t);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  // Keyboard: focus a grip and use the arrow keys.
  list.addEventListener('keydown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const el = grip.closest('[data-sort]');
    if (!el || el.parentElement !== list) return;
    e.preventDefault();
    const items = [...list.querySelectorAll(item)];
    const from = items.indexOf(el);
    const to = e.key === 'ArrowUp' ? from - 1 : from + 1;
    if (to < 0 || to >= items.length) return;
    onMove(from, to, { keyboard: true });
  });
}

export function grip(label) {
  return h('button.grip', { type: 'button', 'data-grip': '', 'aria-label': `${label}. Drag, or press the up and down arrow keys, to move.`, title: 'Drag to move' }, icon('grip', 16));
}

/** Read a picked image and return a square, compressed JPEG data URL. */
export async function squarePhoto(file, size = 480) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That image couldn't be opened.")); i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = Math.min(size, s);
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2.6, s, s, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(url); }
}
