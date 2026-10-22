// The Review tab: writing checks with one-click fixes, matching against a job advert, tailored copies
// for particular jobs, and an optional second opinion from a language model running on this device.

import { h, icon, toast, autosize } from './util.js';
import { matchJob } from '../check/match.js';
import { allText } from '../lib/model.js';
import * as llm from '../lib/llm.js';
import { toText } from '../export/text.js';

const AREA = { contact: 'Contact details', summary: 'Summary', writing: 'Writing', dates: 'Dates', skills: 'Skills', length: 'Length' };
const LEVEL = { fix: 'Fix', tip: 'Tip', note: 'Worth a thought' };

export function renderReview(app, root) {
  const doc = app.doc;
  const wrap = h('div.review');
  const ignored = doc.ignored || {};
  const checks = app.checks.filter((c) => !ignored[c.key]);
  const counts = { fix: 0, tip: 0, note: 0 };
  for (const c of checks) counts[c.level]++;

  // Checks
  const head = checks.length
    ? h('p.review-sum', counts.fix ? h('strong', `${counts.fix} to fix`) : null, counts.fix && (counts.tip || counts.note) ? ', ' : '', [counts.tip ? `${counts.tip} tip${counts.tip > 1 ? 's' : ''}` : '', counts.note ? `${counts.note} thing${counts.note > 1 ? 's' : ''} to think about` : ''].filter(Boolean).join(' and '), '.')
    : h('p.review-sum.good', icon('check', 16), ' Nothing to point out. It reads well.');
  const list = h('ol.checks');
  for (const c of checks) {
    list.append(h('li.check', { class: c.level },
      h('div.check-top', h('span.lvl-tag', LEVEL[c.level]), h('span.area', AREA[c.area] || '')),
      h('p.check-t', c.title),
      h('p.check-d', c.detail),
      h('div.check-actions',
        c.fix ? h('button.small', { type: 'button', on: { click: () => app.applyFix(c) } }, c.fix.label) : null,
        c.path ? h('button.small.ghost', { type: 'button', on: { click: () => app.jumpTo(c.path) } }, 'Show me') : null,
        h('button.link.muted', { type: 'button', on: { click: () => app.edit((d) => { d.ignored = { ...(d.ignored || {}), [c.key]: true }; }, { refresh: true, label: 'Ignore suggestion' }) } }, 'Ignore'))));
  }
  const ignoredN = Object.keys(ignored).filter((k) => app.checks.some((c) => c.key === k)).length;
  wrap.append(h('section.card', h('header.card-h', h('h2', 'Checks')), head, list,
    ignoredN ? h('button.link.muted', { type: 'button', on: { click: () => app.edit((d) => { d.ignored = {}; }, { refresh: true }) } }, `Show ${ignoredN} ignored`) : null));

  wrap.append(jobCard(app));
  wrap.append(aiCard(app));
  root.replaceChildren(wrap);
}

/* ---------- job matching ---------- */

function jobCard(app) {
  const doc = app.doc;
  const card = h('section.card.job', { 'data-path': 'job' });
  const ta = autosize(h('textarea#job-text', { rows: 5, placeholder: 'Paste the job advert here: the whole thing, including requirements.', value: (doc.job && doc.job.text) || '' }));
  const out = h('div.match');
  const show = () => {
    const text = ta.value.trim();
    if (!text) { out.replaceChildren(h('p.hint', 'Quire picks out the skills, tools and qualifications it asks for and shows which ones your CV mentions. Only add what\'s true; the point is not to leave out things you can do.')); return; }
    const m = matchJob(allText(app.doc), text);
    if (!m.terms.length) { out.replaceChildren(h('p.hint', 'No specific skills or requirements found in that text.')); return; }
    const found = m.terms.filter((t) => t.found), missing = m.terms.filter((t) => !t.found);
    out.replaceChildren(
      h('div.meter', { role: 'img', 'aria-label': `Your CV mentions about ${m.score}% of what the advert asks for` }, h('span', { style: { width: m.score + '%' } })),
      h('p.match-sum', h('strong', `${m.score}%`), ` of what the advert asks for is mentioned in your CV. `, missing.length ? 'Missing ones are listed first, most important at the top.' : 'Everything it asks for is there.'),
      missing.length ? h('div.chips.missing', h('p.chips-h', 'Not mentioned'), missing.map((t) => h('span.chip.miss', t.label,
        h('button', { type: 'button', title: `Add "${t.label}" to your skills`, 'aria-label': `Add ${t.label} to your skills`, on: { click: () => app.addSkill(t.label) } }, icon('plus', 12))))) : null,
      found.length ? h('div.chips.found', h('p.chips-h', 'Mentioned'), found.map((t) => h('span.chip.hit', icon('check', 12), t.label))) : null,
    );
  };
  const save = () => app.edit((d) => { d.job = { ...(d.job || {}), text: ta.value }; }, { coalesce: 'job' });
  ta.addEventListener('input', () => { show(); save(); });
  show();
  card.append(h('header.card-h', h('h2', 'Match a job')), h('label.vh', { for: 'job-text' }, 'Job advert'), ta, out,
    h('div.row', h('button.small.ghost', { type: 'button', on: { click: () => app.tailoredCopy(guessJobTitle(ta.value)) } }, 'Make a copy for this job'), h('p.hint.inline', 'Keep your main CV as it is and tailor the copy: hide what\'s less relevant, reorder, rewrite the summary.')));
  return card;
}

export function guessJobTitle(text) {
  const first = String(text || '').split('\n').map((l) => l.trim()).find((l) => l && l.length < 70 && !/^(about|we|our|the|job|role|location|salary)\b/i.test(l));
  return first ? first.replace(/[–—-]\s.*$/, '').trim() : '';
}

/* ---------- the language model ---------- */

function aiCard(app) {
  const card = h('section.card.ai');
  card.append(h('header.card-h', h('h2', icon('sparkle', 16), 'Second opinion'), h('span.badge', 'Optional')));
  if (!llm.loaded()) {
    const choices = h('div.models', llm.MODELS.map((m, i) => h('label.model', h('input', { type: 'radio', name: 'model', value: m.id, checked: i === 0 }), h('span', h('strong', m.name), ` · ${m.size}`), h('small', m.note))));
    const progress = h('div.progress', { hidden: true }, h('div.bar', h('span')), h('p.hint.prog-text', ''));
    const start = h('button', { type: 'button', on: { click: async () => {
      const m = llm.MODELS.find((x) => x.id === choices.querySelector('input:checked').value);
      start.disabled = true; progress.hidden = false;
      try {
        await llm.loadFromUrl(m, (l, t) => {
          const pct = t ? Math.round((l / t) * 100) : 0;
          progress.querySelector('span').style.width = pct + '%';
          progress.querySelector('.prog-text').textContent = t ? `Downloading ${m.name}: ${(l / 1e6).toFixed(0)} of ${(t / 1e6).toFixed(0)} MB` : 'Starting…';
        });
        toast(`${m.name} is ready. It's now saved in this browser for next time.`);
        app.refresh();
      } catch (e) {
        start.disabled = false; progress.hidden = true;
        toast(`Couldn't load the model: ${e.message || e}. Check your connection, or that this browser has room to store it.`, { ms: 8000 });
      }
    } } }, 'Download and start');
    const fromFile = h('input.vh#gguf', { type: 'file', accept: '.gguf', on: { change: async (e) => { const f = e.target.files[0]; if (!f) return; try { await llm.loadFromFile(f); app.refresh(); } catch (err) { toast(err.message); } } } });
    card.append(
      h('p', 'A small language model can review your writing, suggest stronger bullet points and draft a summary for a job. It runs entirely on this device: your CV never leaves it.'),
      h('p.warn', h('strong', 'It\'s slow and it\'s a big download. '), 'The model downloads once (the browser keeps it for next time). A full review takes a minute or two on a typical laptop and longer on a phone. Small models also get things wrong, so treat what it says as suggestions.'),
      choices, h('div.row', start, h('label.link', { for: 'gguf' }, 'Or use a .gguf file you have'), fromFile), progress,
    );
    llm.cachedModels().then((have) => { if (have.length) { start.textContent = 'Start (already downloaded)'; const r = choices.querySelector(`input[value="${have[0].id}"]`); if (r) r.checked = true; } });
    return card;
  }
  const output = h('div.ai-out', { 'aria-live': 'polite' });
  const busy = (on, btns) => { for (const b of btns) b.disabled = on; stopBtn.hidden = !on; };
  const stopBtn = h('button.small.ghost', { type: 'button', hidden: true, on: { click: () => llm.stop() } }, 'Stop');
  const reviewBtn = h('button.small', { type: 'button', on: { click: async () => {
    busy(true, [reviewBtn, summaryBtn]);
    output.replaceChildren(h('p.hint', 'Reading your CV… (this can take a minute)'));
    try {
      const text = await llm.reviewCv(toText(app.doc), app.doc.job && app.doc.job.text, (t) => { output.replaceChildren(h('div.ai-text', t)); });
      output.replaceChildren(h('div.ai-text', text.trim() || 'No suggestions.'));
    } catch (e) { output.replaceChildren(h('p.warn', String(e.message || e))); }
    busy(false, [reviewBtn, summaryBtn]);
  } } }, 'Review my CV');
  const hasJob = !!(app.doc.job && app.doc.job.text.trim());
  const summaryBtn = h('button.small.ghost', { type: 'button', disabled: !hasJob, title: hasJob ? '' : 'Paste a job advert above first', on: { click: async () => {
    busy(true, [reviewBtn, summaryBtn]);
    output.replaceChildren(h('p.hint', 'Writing a summary for this job…'));
    try {
      const s = await llm.tailorSummary(toText(app.doc), app.doc.job.text, (t) => output.replaceChildren(h('div.ai-text', t)));
      output.replaceChildren(h('div.ai-text', s), h('div.row', h('button.small', { type: 'button', on: { click: () => { app.edit((d) => { d.resume.basics.summary = s; }, { refresh: true, label: 'Use suggested summary' }); toast('Summary replaced. Undo brings the old one back.'); } } }, 'Use this summary')));
    } catch (e) { output.replaceChildren(h('p.warn', String(e.message || e))); }
    busy(false, [reviewBtn, summaryBtn]);
  } } }, 'Draft a summary for the job');
  card.append(h('p.hint', `Using ${llm.engineName()} on this device. You can also ask it to improve any bullet point with the `, icon('sparkle', 13), ' button next to it.'),
    h('div.row', reviewBtn, summaryBtn, stopBtn), output);
  return card;
}
