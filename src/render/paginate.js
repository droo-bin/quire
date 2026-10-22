// Lays a CV out on real pages (A4 or Letter). Blocks flow down each region (main column, sidebar) and
// move to the next page when they don't fit; a long job splits between its bullet points, and a section
// heading never sits alone at the bottom of a page. "Fit to N pages" shrinks the type and spacing just
// enough, never below a readable size.

import { build, lookVars } from './templates.js';

export const PAGE = { A4: { w: '210mm', h: '297mm', pt: [595.28, 841.89] }, Letter: { w: '8.5in', h: '11in', pt: [612, 792] } };
const MIN_SCALE = 0.78;

const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
const overflows = (el) => el.scrollHeight > el.clientHeight + 0.5;

function newPage(root, built, index, size) {
  const page = document.createElement('section');
  page.className = 'page';
  page.dataset.page = String(index + 1);
  page.style.width = PAGE[size].w;
  page.style.height = PAGE[size].h;
  const sheet = div('sheet');
  const cols = div('cols');
  const regions = { main: div('region main') };
  if (built.hasSide) { regions.side = div('region side'); cols.append(regions.side); }
  cols.append(regions.main);
  if (index === 0) {
    if (built.hasSide) regions.side.append(built.header);
    else sheet.append(built.header);
  } else page.classList.add('later');
  sheet.append(cols);
  page.append(sheet);
  root.append(page);
  return { page, regions };
}

/** Can this block be split between its bullet points? */
const splittable = (b) => b.classList && b.classList.contains('entry') && b.querySelectorAll(':scope > .e-list > li').length > 1;

/** Put blocks into a region page by page. */
function flow(blocks, getRegion) {
  let p = 0;
  for (let k = 0; k < blocks.length; k++) {
    let block = blocks[k];
    for (let guard = 0; guard < 40 && block; guard++) {
      const region = getRegion(p);
      region.append(block);
      if (!overflows(region)) { block = null; break; }
      region.removeChild(block);
      // Split a long entry between bullets, keeping its heading with at least two of them.
      if (splittable(block)) {
        const items = [...block.querySelector(':scope > .e-list').children];
        const head = block.cloneNode(true);
        const list = head.querySelector(':scope > .e-list');
        list.replaceChildren();
        region.append(head);
        let placed = 0;
        if (!overflows(region)) {
          for (const li of items) { list.append(li); if (overflows(region)) { list.removeChild(li); break; } placed++; }
        }
        const minFirst = Math.min(2, items.length - 1);
        if (placed >= minFirst && placed < items.length && !overflows(region)) {
          const rest = block.cloneNode(false);
          rest.classList.add('cont');
          const restList = document.createElement('ul');
          restList.className = 'e-list';
          for (const li of items.slice(placed)) restList.append(li);
          rest.append(restList);
          block = rest;
          p++;
          continue;
        }
        region.removeChild(head);
        // put the items back for the next attempt
        const origList = block.querySelector(':scope > .e-list');
        for (const li of items) origList.append(li);
      }
      // Nothing of it fits here: take a dangling heading along, unless the page is otherwise empty.
      const last = region.lastElementChild;
      if (last && last.classList.contains('sec-h') && region.children.length > 1) { region.removeChild(last); getRegion(p + 1).append(last); }
      if (!region.children.length || (region.children.length === 1 && region.firstElementChild.classList.contains('cv-head'))) {
        // An empty page and it still doesn't fit: let it run over rather than loop.
        region.append(block); block = null; break;
      }
      p++;
    }
  }
}

/**
 * Lay out `doc` into `container`. Returns { pages, scale, root }.
 * opts.scale overrides the type scale (used while fitting).
 */
export function layout(doc, container, opts = {}) {
  const built = build(doc);
  const root = div(`cv t-${built.look.id}`);
  const vars = lookVars(doc);
  const scale = opts.scale || 1;
  if (scale !== 1) {
    vars['--fs'] = `${(parseFloat(vars['--fs']) * scale).toFixed(3)}pt`;
    vars['--sp'] = String((+vars['--sp'] * (0.5 + scale / 2)).toFixed(3));
    vars['--m'] = `${(parseFloat(vars['--m']) * Math.max(0.75, scale)).toFixed(2)}mm`;
  }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  container.replaceChildren(root);
  const size = PAGE[doc.layout.size] ? doc.layout.size : 'A4';
  const pages = [];
  const ensure = (i) => { while (pages.length <= i) pages.push(newPage(root, built, pages.length, size)); return pages[i]; };
  ensure(0);
  flow(built.regions.main, (i) => ensure(i).regions.main);
  if (built.hasSide) flow(built.regions.side, (i) => ensure(i).regions.side);
  return { pages: pages.length, scale, root };
}

/** Lay out, shrinking to fit doc.layout.fit pages if asked. Returns { pages, scale, natural }. */
export function layoutFitted(doc, container) {
  const first = layout(doc, container);
  const target = doc.layout.fit;
  if (!target || first.pages <= target) return { ...first, natural: first.pages };
  let lo = MIN_SCALE, hi = 1, best = null;
  const at = (s) => layout(doc, container, { scale: s });
  if (at(lo).pages > target) { const r = layout(doc, container); return { ...r, natural: first.pages, tooLong: true }; }
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).pages <= target) { best = mid; lo = mid; } else hi = mid;
  }
  const r = at(best || lo);
  return { ...r, natural: first.pages };
}
