// The start screen (your CVs, and ways to begin) and the dialogs around importing and earlier versions.

import { h, icon, relTime, dialog } from './util.js';
import { listSnapshots } from '../lib/store.js';
import { SECTIONS } from '../lib/model.js';

export function renderHome(app, root, docs) {
  const fileInput = h('input.vh#import-home', { type: 'file', accept: '.pdf,.docx,.odt,.json,.txt,.md,.rtf,.zip,application/pdf', multiple: false, on: { change: (e) => { if (e.target.files[0]) app.importFiles(e.target.files); e.target.value = ''; } } });
  const drop = h('label.dropzone', { for: 'import-home' },
    h('span.dz-icon', icon('upload', 26)),
    h('strong', 'Import your CV'),
    h('span', 'PDF, Word, JSON Resume or a LinkedIn data export. Drop it here or choose a file.'),
    h('span.dz-note', 'It\'s read on this device; nothing is uploaded.'),
    fileInput);
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));

  const starts = h('div.starts',
    drop,
    h('div.start-col',
      h('button.start', { type: 'button', on: { click: () => app.createBlank() } }, h('strong', 'Start from scratch'), h('span', 'A blank CV with the usual sections ready to fill in.')),
      h('button.start', { type: 'button', on: { click: () => app.pasteText() } }, h('strong', 'Paste your CV as text'), h('span', 'From an email, a document or a job site profile.')),
      h('button.start', { type: 'button', on: { click: () => app.createExample() } }, h('strong', 'Try an example'), h('span', 'A filled-in CV to play with templates and checks.')),
    ),
  );

  const mine = docs.length ? h('section.mine', h('h2', 'Your CVs'),
    h('ul.doc-list', docs.map((d) => h('li', h('button.doc', { type: 'button', on: { click: () => app.openDoc(d.id) } },
      h('span.doc-name', d.name || 'Untitled CV'),
      h('span.doc-meta', [d.resume.basics.label, `edited ${relTime(d.updated)}`].filter(Boolean).join(' · ')),
      d.job && d.job.text && d.job.text.trim() ? h('span.doc-tag', 'Tailored') : null))))) : null;

  root.replaceChildren(h('div.home',
    h('div.home-intro',
      h('h1', 'Make a CV you\'re happy to send.'),
      h('p', 'Bring in the CV you have, or start fresh. Pick a template, tighten the writing with checks that explain themselves, match it to a job, and download a proper PDF. It all stays in this browser: no account, no uploads, works offline.')),
    starts, mine,
    h('p.home-foot', 'Free and open source. Your CVs are saved in this browser only, so download a copy (JSON keeps everything) if you want a backup or to move to another device.'),
  ));
}

/** What an import found, and what to check. */
export function importReport(app, result) {
  const { doc, formatName, report, exact } = result;
  if (!report || exact) return;
  const r = doc.resume;
  const counts = [
    ['work', r.work.length, 'job'], ['education', r.education.length, 'qualification'], ['skills', r.skills.reduce((n, s) => n + (s.keywords.length || 1), 0), 'skill'],
    ['projects', r.projects.length, 'project'], ['certificates', r.certificates.length, 'certification'], ['languages', r.languages.length, 'language'],
  ].filter(([, n]) => n);
  const contact = ['name', 'email', 'phone', 'location', 'LinkedIn', 'GitHub'].filter((x) => report.found.includes(x));
  const missing = ['name', 'email', 'phone'].filter((x) => !report.found.includes(x));
  const body = h('div.report',
    h('p', `Quire read your ${formatName} and found:`),
    h('ul.found',
      contact.length ? h('li', icon('check', 14), `Contact details: ${contact.join(', ').replace('location', 'where you are')}`) : null,
      r.basics.summary ? h('li', icon('check', 14), 'A summary') : null,
      counts.map(([, n, what]) => h('li', icon('check', 14), `${n} ${what}${n === 1 ? '' : 's'}`)),
      doc.custom.length ? h('li', icon('check', 14), `${doc.custom.length} other section${doc.custom.length > 1 ? 's' : ''}: ${doc.custom.map((c) => c.title).join(', ')}`) : null),
    missing.length || report.unsure.length ? h('div.to-check', h('h3', 'Worth checking'), h('ul',
      missing.map((m) => h('li', `No ${m} found. Add it under Your details.`)),
      report.unsure.map((s) => h('li', `In ${SECTIONS[s] ? SECTIONS[s].title : s}, job titles and employers were hard to tell apart. Check they're the right way round.`)),
      h('li', 'Dates, and which lines became bullet points.'))) : h('p.hint', 'Have a look through each section anyway: reading a CV that was designed for people is guesswork.'),
  );
  dialog('Imported', body, { actions: [h('button', { type: 'button', on: { click: (e) => e.target.closest('dialog').close() } }, 'Start editing')] });
}

export async function versionsDialog(app) {
  const snaps = await listSnapshots(app.doc.id);
  const body = snaps.length
    ? h('ul.versions', snaps.map((s) => h('li', h('span', h('strong', new Date(s.at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })), h('small', ` ${relTime(s.at)} · ${s.reason}`)),
      h('button.small.ghost', { type: 'button', on: { click: (e) => { e.target.closest('dialog').close(); app.restoreSnapshot(s); } } }, 'Restore'))))
    : h('p', 'No earlier versions yet. Quire keeps one every ten minutes or so while you work, and before imports and big changes.');
  dialog('Earlier versions', [h('p.hint', 'Restoring keeps your current version as a version too, so nothing is lost.'), body]);
}
