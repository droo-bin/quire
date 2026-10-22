// Writing checks: the things a careful friend (or a recruiter skimming 200 CVs) would point out. Each
// result says where it is (so the editor can jump there), why it matters, and offers a fix when the fix
// is mechanical. Nothing here sends your CV anywhere.

import { SECTIONS, sectionItems, itemPath, getPath, allText, sortByDate } from '../lib/model.js';
import { dateValue, monthsBetween, formatDate } from '../lib/dates.js';
import { WEAK_OPENERS, CLICHES, STRONG_VERBS, leadingVerb, pastTense, PROPER_NAMES } from './words.js';

const plain = (s) => String(s || '').replace(/\*\*/g, '');
const wordsIn = (s) => (plain(s).match(/[\p{L}\p{N}'’-]+/gu) || []).length;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const today = () => new Date();
const ROLE_SECTIONS = ['work', 'volunteer'];

/** Every bullet in the CV: { id, i, j, text, path, entry }. */
function bullets(doc) {
  const out = [];
  for (const id of ['work', 'volunteer', 'projects']) {
    sectionItems(doc, id).forEach((e, i) => {
      if (doc.hidden[itemPath(id, i)]) return;
      (e.highlights || []).forEach((text, j) => { const path = `${itemPath(id, i)}.highlights.${j}`; if (text.trim() && !doc.hidden[path]) out.push({ id, i, j, text, path, entry: e }); });
    });
  }
  for (const c of doc.custom || []) c.items.forEach((e, i) => (e.highlights || []).forEach((text, j) => { if (text.trim()) out.push({ id: 'custom:' + c.id, i, j, text, path: `custom:${c.id}.${i}.highlights.${j}`, entry: e }); }));
  return out;
}

function suggestVerbs(text) {
  const t = text.toLowerCase();
  const group = /team|people|staff|engineers|colleagues|mentor/.test(t) ? 'lead' : /cost|time|reduc|faster|improv|efficien|automat/.test(t) ? 'improve'
    : /built|system|tool|website|app|process|platform|report/.test(t) ? 'build' : /sale|revenue|client|contract|target|growth/.test(t) ? 'win'
      : /data|research|analys|insight/.test(t) ? 'analyse' : /present|train|write|document|stakeholder/.test(t) ? 'communicate' : 'support';
  return STRONG_VERBS[group].slice(0, 4);
}

export function runChecks(doc, { pages = 0 } = {}) {
  const out = [];
  const add = (level, area, title, detail, path, fix) => out.push({ level, area, title, detail, path, fix, key: `${area}|${title}|${path || ''}` });
  const b = doc.resume.basics;

  /* ----- contact details ----- */
  if (!b.name.trim()) add('fix', 'contact', 'Add your name', 'It goes at the top in large type, and becomes the PDF\'s title.', 'basics.name');
  if (!b.email.trim()) add('fix', 'contact', 'Add an email address', 'Recruiters need a way to reply.', 'basics.email');
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email.trim())) add('fix', 'contact', 'Check your email address', `"${b.email}" doesn't look like a complete email address.`, 'basics.email');
  else if (/(19[5-9]\d|200\d)|sexy|babe|hot|lol|xx/.test(b.email.split('@')[0].toLowerCase())) add('tip', 'contact', 'Consider a plainer email address', 'Birth years and nicknames in an address can distract. Something like firstname.lastname@ reads as more professional.', 'basics.email');
  if (!b.phone.trim()) add('tip', 'contact', 'Add a phone number', 'Many employers still ring to arrange interviews.', 'basics.phone');
  if (!b.location.city.trim()) add('tip', 'contact', 'Say where you are', 'A town or city is enough (no full address needed). Employers use it to check you can get to the job.', 'basics.location.city');
  if (b.location.address && /\d/.test(b.location.address)) add('tip', 'contact', "You don't need your full address", 'A town or city is enough, and safer on a document you send to strangers.', 'basics.location.address');
  if (!b.profiles.some((p) => /linkedin/i.test(p.network + p.url))) add('note', 'contact', 'Add your LinkedIn profile', 'Most recruiters look you up there; a link saves them a search.', 'basics.profiles');
  if (b.image && doc.layout.showPhoto) add('note', 'contact', 'About the photo', 'In the UK, Ireland and the US, recruiters generally prefer CVs without a photo, to avoid bias. Elsewhere in Europe one is usual.', 'basics.image');

  const text = allText(doc);
  const personal = text.match(/\b(date of birth|d\.o\.b|dob|marital status|married|single|nationality|religion|national insurance|ni number|passport number)\b/i);
  if (personal) add('tip', 'contact', 'Leave out personal details', `"${personal[0]}" isn't needed on a CV in the UK or US, and employers aren't meant to use it. Your right to work can be mentioned instead if it matters.`, null);

  /* ----- summary ----- */
  const summary = plain(b.summary).trim();
  if (!summary) add('tip', 'summary', 'Add a short summary', 'Two or three lines at the top: who you are, what you\'re good at and what you want next. It\'s the part most people read.', 'basics.summary');
  else {
    const n = wordsIn(summary);
    if (n > 90) add('tip', 'summary', 'Shorten your summary', `It's ${n} words. Around 40 to 70 gets read; longer gets skimmed.`, 'basics.summary');
    if (/^(i am|i'm|i have)\b/i.test(summary)) add('note', 'summary', 'Try starting without "I"', 'Summaries usually drop the "I": "Data engineer with eight years…" rather than "I am a data engineer…".', 'basics.summary');
  }

  /* ----- clichés ----- */
  // Award and publication titles are names, not claims ("Team Player of the Year" is fine).
  const own = allText({ ...doc, resume: { ...doc.resume, awards: [], publications: [] } });
  const found = CLICHES.filter((c) => new RegExp(`\\b${c.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i').test(own));
  if (found.length) add('tip', 'writing', found.length === 1 ? `"${found[0]}" says very little` : `${found.length} phrases that say very little`, `${found.map((f) => `"${f}"`).join(', ')}. Everyone says ${found.length === 1 ? 'it' : 'these'}; an example of it in action is more convincing.`, findPath(doc, found[0]));

  /* ----- bullets ----- */
  const all = bullets(doc);
  const openers = new Map();
  for (const bl of all) {
    const t = plain(bl.text).trim();
    const lower = t.toLowerCase();
    const weak = WEAK_OPENERS.find((w) => lower === w || lower.startsWith(w + ' '));
    if (weak) {
      add('tip', 'writing', `Start with what you did, not "${cap(weak)}"`, `"${trim(t)}" describes a duty. Lead with an action and its result, e.g. ${suggestVerbs(t).map((v) => `"${v}…"`).join(', ')}.`, bl.path);
    }
    if (/\b(i|my|me)\b/.test(t.replace(/^I\b/, 'i')) && /(^|\s)(I|my|me)\b/.test(t)) add('note', 'writing', 'Drop "I" and "my" from bullet points', `CV bullets read better without them: "${trim(t)}".`, bl.path);
    const n = wordsIn(t);
    if (n > 45) add('tip', 'writing', 'Split or trim a long bullet', `This one is ${n} words. Bullets of one or two lines get read; this is closer to a paragraph.`, bl.path);
    // Tense: past roles in the past tense.
    const role = ROLE_SECTIONS.includes(bl.id) || bl.id === 'projects';
    const lv = leadingVerb(t);
    if (role && lv && bl.entry.endDate) {
      const past = cap(pastTense(lv.base));
      add('tip', 'writing', 'Use the past tense for a past job', `"${lv.word}…" reads as if you still do it. "${past}…" fits a job that has ended.`, bl.path, {
        label: `Change to "${past}"`,
        run: (d) => { const v = getPathValue(d, bl.path); setPathValue(d, bl.path, v.replace(/^\s*\S+/, past)); },
      });
    } else if (role && lv && lv.form !== 'present' && !bl.entry.endDate) {
      const now = cap(lv.base);
      add('note', 'writing', `"${now}" reads more crisply than "${lv.word}"`, 'Bullets usually start with a plain verb.', bl.path, { label: `Change to "${now}"`, run: (d) => { const v = getPathValue(d, bl.path); setPathValue(d, bl.path, v.replace(/^\s*\S+/, now)); } });
    }
    const first = (t.match(/^[A-Za-z]+/) || [''])[0].toLowerCase();
    if (first) openers.set(first, (openers.get(first) || []).concat(bl));
  }
  for (const [word, list] of openers) {
    if (list.length >= 4) add('note', 'writing', `${list.length} bullets start with "${cap(word)}"`, `Some variety reads better. Alternatives: ${suggestVerbs(list[0].text).filter((v) => v.toLowerCase() !== word).slice(0, 4).join(', ')}.`, list[2].path);
  }
  // Numbers: each role should show a result somewhere.
  for (const id of ROLE_SECTIONS) {
    sectionItems(doc, id).forEach((e, i) => {
      if (doc.hidden[itemPath(id, i)]) return;
      const hl = (e.highlights || []).filter((x) => x.trim());
      if (hl.length >= 2 && !/\d|£|\$|€|%|\b(one|two|three|four|five|six|seven|eight|nine|ten|twice|double|half|hundreds|thousands)\b/i.test(hl.join(' ') + ' ' + e.summary)) {
        add('tip', 'writing', `Add a number to ${e.position || e.name || 'this role'}`, 'Numbers make results concrete: how many, how much, how fast, how often. Even an estimate ("about 30 clients a week") helps.', itemPath(id, i));
      }
      if (!hl.length && !e.summary.trim() && (e.position || e.name)) add('tip', 'writing', `Say what you did at ${e.name || e.position}`, 'Two to five bullets on what you achieved there, newest roles in most detail.', itemPath(id, i));
    });
  }
  // Full stops: all or none.
  if (all.length >= 5) {
    const withStop = all.filter((x) => /[.!?]$/.test(plain(x.text).trim())).length;
    if (withStop && withStop < all.length && Math.min(withStop, all.length - withStop) >= 2) {
      const majority = withStop * 2 >= all.length;
      add('note', 'writing', 'Be consistent with full stops', `${withStop} of ${all.length} bullets end with a full stop. Either way is fine; mixing looks careless.`, all.find((x) => /[.!?]$/.test(plain(x.text).trim()) !== majority).path, {
        label: majority ? 'Add full stops to all' : 'Remove them all',
        run: (d) => { for (const x of bullets(d)) { const v = getPathValue(d, x.path); const t = v.trim(); setPathValue(d, x.path, majority ? (/[.!?:;]$/.test(t) ? t : t + '.') : t.replace(/\.$/, '')); } },
      });
    }
  }

  /* ----- spelling of names, and UK/US spelling ----- */
  const wrong = new Map();
  const skillText = doc.resume.skills.flatMap((x) => [x.name, ...x.keywords]).join(' | ');
  for (const m of text.matchAll(/(?<![\w.])([A-Za-z][\w#.+/]*[\w#+])(?![\w])/g)) {
    const w = m[1];
    const right = PROPER_NAMES[w.toLowerCase()];
    if (!right || w === right) continue;
    // Ordinary English words (react, go, excel…) are only corrected inside skills lists.
    if (AMBIGUOUS.has(w.toLowerCase()) && !new RegExp(`(^|\\|\\s)${w.replace(/[.+#]/g, '\\$&')}(\\s|\\||$)`).test(skillText)) continue;
    wrong.set(w, right);
  }
  if (wrong.size) {
    const list = [...wrong];
    add('tip', 'writing', list.length === 1 ? `Write "${list[0][1]}" the official way` : `${list.length} names to write the official way`, list.map(([a, b2]) => `${a} → ${b2}`).join(', ') + '. Recruiters notice, and so does keyword search.', findPath(doc, list[0][0]), {
      label: 'Fix them all',
      run: (d) => {
        const fix = (ambiguousToo) => (s) => s.replace(/(?<![\w.])([A-Za-z][\w#.+/]*[\w#+])(?![\w])/g, (w) => (wrong.has(w) && (ambiguousToo || !AMBIGUOUS.has(w.toLowerCase())) ? wrong.get(w) : w));
        replaceEverywhere(d, fix(false));
        // Words like "react" or "excel" are only changed inside skills lists, never in sentences.
        d.resume.skills = d.resume.skills.map((s) => ({ ...s, name: fix(true)(s.name), keywords: s.keywords.map(fix(true)) }));
      },
    });
  }
  const uk = (text.match(/\b\w+(ise|ised|ising|isation|our|yse|ysed|ysing|tre|ogue)s?\b/gi) || []).filter((w) => !/^(rise|wise|otherwise|exercise|premise|promise|advise|advised|surprise|enterprise|expertise|franchise|merchandise|compromise|concise|precise|noise|raise|praise|cruise|revise|revised|supervise|supervised|televise|devise|comprise|comprised|improvise|despise|disguise|chastise|incise|excise|apprise|four|your|our|hour|tour|pour|sour|flour|course|courses|source|sources|resource|resources|dialogue|catalogue|four|centre|theatre|metre|litre|spectre|tre)$/i.test(w));
  const us = (text.match(/\b\w+(ize|ized|izing|ization|yze|yzed|yzing|ter|og)s?\b/gi) || []).filter((w) => /iz|yz/i.test(w));
  if (uk.length >= 2 && us.length >= 2) add('note', 'writing', 'Mixed British and American spelling', `For example "${uk[0]}" and "${us[0]}". Pick one and stick to it (British for UK employers).`, findPath(doc, us[0]));

  /* ----- dates ----- */
  for (const id of [...ROLE_SECTIONS, 'education', 'projects']) {
    const items = sectionItems(doc, id);
    items.forEach((e, i) => {
      if (doc.hidden[itemPath(id, i)]) return;
      const name = e.position || e.name || e.institution || e.studyType || 'an entry';
      if (id !== 'projects' && (e.position || e.name || e.institution) && !e.startDate && !(id === 'education' && e.endDate)) add('tip', 'dates', `Add dates to ${name}`, 'Missing dates make recruiters wonder what you\'re hiding. Month and year is plenty.', itemPath(id, i));
      if (e.startDate && /[a-z]/i.test(e.startDate)) add('fix', 'dates', `Check the start date of ${name}`, `"${e.startDate}" isn't a date Quire can read. Pick a month and year.`, itemPath(id, i));
      if (e.endDate && /[a-z]/i.test(e.endDate)) add('fix', 'dates', `Check the end date of ${name}`, `"${e.endDate}" isn't a date Quire can read.`, itemPath(id, i));
      if (e.startDate && e.endDate && dateValue(e.endDate) < dateValue(e.startDate)) add('fix', 'dates', `${name} ends before it starts`, `${formatDate(e.startDate)} to ${formatDate(e.endDate)}.`, itemPath(id, i));
      if (e.startDate && dateValue(e.startDate) > dateValue(isoNow()) + 0.1 && id !== 'education') add('note', 'dates', `${name} starts in the future`, 'Fine for an offer you\'ve accepted; worth a check otherwise.', itemPath(id, i));
    });
    // Order: newest first.
    if (['work', 'education', 'volunteer'].includes(id)) {
      const shown = items.filter((e, i) => !doc.hidden[itemPath(id, i)] && (e.startDate || e.endDate));
      const sorted = sortByDate(shown, SECTIONS[id].view);
      // Newest first by end date, or by start date when roles overlap: either reads as reverse order.
      const byStart = shown.every((e, k) => k === 0 || dateValue(e.startDate, 0) <= dateValue(shown[k - 1].startDate, 0));
      if (shown.length > 1 && !byStart && sorted.some((e, k) => e !== shown[k])) add('tip', 'dates', `Put ${SECTIONS[id].title.toLowerCase()} newest first`, 'Recruiters expect reverse date order and read the top entry most closely.', `section:${id}`, {
        label: 'Sort newest first', run: (d) => sortSection(d, id),
      });
    }
  }
  // Gaps between jobs.
  const jobs = sectionItems(doc, 'work').filter((e, i) => !doc.hidden[itemPath('work', i)] && e.startDate && /^\d{4}/.test(e.startDate)).map((e) => ({ e, s: dateValue(e.startDate), end: e.endDate ? dateValue(e.endDate) : dateValue(isoNow()) }));
  jobs.sort((a, z) => a.s - z.s);
  let reach = -Infinity;
  for (let k = 0; k < jobs.length; k++) {
    if (k > 0 && jobs[k].s - reach > 0.55) {
      const prev = jobs.slice(0, k).reduce((a, z) => (z.end > a.end ? z : a));
      const months = monthsBetween(prev.e.endDate || isoNow(), jobs[k].e.startDate) - 1;
      if (months >= 6) add('note', 'dates', `A ${months >= 24 ? Math.round(months / 12) + '-year' : months + '-month'} gap before ${jobs[k].e.position || jobs[k].e.name}`, 'Gaps are normal (study, caring, travel, health, job hunting). A line saying what you did helps a reader not to guess.', itemPath('work', doc.resume.work.indexOf(jobs[k].e)));
    }
    reach = Math.max(reach, jobs[k].end);
  }

  /* ----- skills ----- */
  const skillNames = doc.resume.skills.flatMap((s, i) => (s.keywords.length ? s.keywords : [s.name]).map((k) => ({ k: k.trim(), i })));
  const seen = new Map(), dups = new Set();
  for (const { k } of skillNames) { const low = k.toLowerCase(); if (seen.has(low)) dups.add(k); seen.set(low, k); }
  if (dups.size) add('tip', 'skills', 'Remove repeated skills', `${[...dups].join(', ')} ${dups.size === 1 ? 'is' : 'are'} listed more than once.`, 'section:skills', { label: 'Remove repeats', run: (d) => dedupeSkills(d) });
  if (skillNames.length > 35) add('note', 'skills', 'A long skills list', `${skillNames.length} skills is a lot to take in. Lead with the ones the job asks for, and group the rest.`, 'section:skills');
  if (!skillNames.length) add('tip', 'skills', 'List your key skills', 'A short skills section helps both people and keyword searches find what you can do.', 'section:skills');

  /* ----- length ----- */
  const words = wordsIn(text);
  if (pages > 2) add('tip', 'length', `${pages} pages is long`, 'Two pages is the usual limit in the UK (one if you\'re early in your career). Older roles can shrink to a line each, or Fit to 2 pages can tighten the layout.', null);
  if (words < 150 && (b.name || all.length)) add('note', 'length', 'Your CV is quite short', 'There\'s room to say more about what you achieved in each role.', null);
  return out.sort((a, z) => order(a.level) - order(z.level));
}

const order = (l) => ({ fix: 0, tip: 1, note: 2 }[l] ?? 3);
const trim = (t) => (t.length > 70 ? t.slice(0, 67).trimEnd() + '…' : t);
const isoNow = () => { const d = today(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const AMBIGUOUS = new Set(['go', 'react', 'swift', 'rust', 'spark', 'excel', 'agile', 'outlook', 'angular', 'ruby', 'docker', 'python', 'java', 'scrum', 'kanban', 'rails', 'pandas', 'redis', 'snowflake', 'linux', 'unix', 'azure', 'figma', 'jira', 'tableau', 'kotlin', 'vue', 'dbt', 'ansible', 'terraform', 'kafka', 'hadoop', 'django', 'webpack', 'salesforce', 'xero', 'swift']);

/** Read/write a value at a check path on a document. */
export function getPathValue(doc, path) {
  const m = String(path).match(/^custom:([^.]+)\.(.*)$/);
  if (m) { const c = doc.custom.find((x) => x.id === m[1]); return c ? getPath(c.items, m[2]) : undefined; }
  if (path.startsWith('basics')) return getPath(doc.resume, path);
  return getPath(doc.resume, path);
}
export function setPathValue(doc, path, value) {
  const m = String(path).match(/^custom:([^.]+)\.(.*)$/);
  if (m) { const c = doc.custom.find((x) => x.id === m[1]); if (c) setDeep(c.items, m[2], value); return; }
  setDeep(doc.resume, path, value);
}
function setDeep(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

/** Where a phrase first appears, for jumping to it. */
export function findPath(doc, phrase) {
  if (!phrase) return null;
  const re = new RegExp(String(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]/g, '[-\\s]'), 'i');
  const walk = (v, path) => {
    if (typeof v === 'string') return re.test(v) ? path : null;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const r = walk(v[i], `${path}.${i}`); if (r) return r; } return null; }
    if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) { if (k === 'image') continue; const r = walk(x, path ? `${path}.${k}` : k); if (r) return r; } }
    return null;
  };
  const r = walk(doc.resume, '');
  if (r) return r.replace(/^\./, '');
  for (const c of doc.custom || []) { const p = walk(c.items, `custom:${c.id}`); if (p) return p; }
  return null;
}

function replaceEverywhere(doc, fn) {
  const walk = (v) => (typeof v === 'string' ? fn(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ['image', 'url', 'email', 'username', 'network', 'phone'].includes(k) ? x : walk(x)])) : v);
  doc.resume = walk(doc.resume);
  doc.custom = (doc.custom || []).map((c) => ({ ...c, items: walk(c.items) }));
}

/** Sort a section newest first, keeping hidden flags attached to their entries. */
export function sortSection(doc, id) {
  const items = sectionItems(doc, id);
  const tagged = items.map((e, i) => ({ e, hidden: !!doc.hidden[itemPath(id, i)], sub: Object.keys(doc.hidden).filter((k) => k.startsWith(itemPath(id, i) + '.')).map((k) => k.slice(itemPath(id, i).length)) }));
  const view = SECTIONS[id] ? SECTIONS[id].view : { start: 'startDate', end: 'endDate' };
  const sorted = sortByDate(tagged.map((t) => t.e), view).map((e) => tagged.find((t) => t.e === e));
  const prefix = itemPath(id, 0).replace(/0$/, '');
  for (const k of Object.keys(doc.hidden)) if (k.startsWith(prefix)) delete doc.hidden[k];
  sorted.forEach((t, i) => { items[i] = t.e; if (t.hidden) doc.hidden[itemPath(id, i)] = true; for (const s of t.sub) doc.hidden[itemPath(id, i) + s] = true; });
}

function dedupeSkills(doc) {
  const seen = new Set();
  const before = doc.resume.skills.map((s, i) => ({ s, i, hidden: !!doc.hidden[`skills.${i}`] }));
  doc.resume.skills = doc.resume.skills.map((s) => {
    if (s.keywords.length) return { ...s, keywords: s.keywords.filter((k) => { const l = k.trim().toLowerCase(); if (seen.has(l)) return false; seen.add(l); return true; }) };
    const l = s.name.trim().toLowerCase();
    if (seen.has(l)) return null;
    seen.add(l);
    return s;
  }).map((s, i) => (s ? { s, i } : null));
  // Keep each surviving group's hidden flag with it.
  const kept = doc.resume.skills.filter((x) => x && (x.s.keywords.length || x.s.name));
  for (const k of Object.keys(doc.hidden)) if (/^skills\.\d+$/.test(k)) delete doc.hidden[k];
  kept.forEach((x, n) => { if (before[x.i].hidden) doc.hidden[`skills.${n}`] = true; });
  doc.resume.skills = kept.map((x) => x.s);
}
