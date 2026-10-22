// Structured CV formats: JSON Resume (and YAML-free variants of it), FRESH, Reactive Resume and LinkedIn's
// "Get a copy of your data" export. Each becomes JSON Resume; the import report says what was found.

import { normalizeResume } from '../lib/model.js';
import { parseDate, findRange } from '../lib/dates.js';
import { csvObjects } from '../lib/csv.js';

/** Which structured format is this parsed JSON? */
export function detectJson(j) {
  if (!j || typeof j !== 'object') return null;
  if (j.meta && j.meta.quire) return 'quire';
  if (j.sections && j.basics && (j.sections.experience || j.sections.summary)) return 'reactive';
  if (j.employment || (j.info && (j.contact || j.name)) || (j.meta && /fresh/i.test(j.meta.format || ''))) return 'fresh';
  if (j.basics || j.work || j.education || j.skills) return 'jsonresume';
  if (j.resume && typeof j.resume === 'object') return detectJson(j.resume);
  return null;
}

/** Plain text from HTML (Reactive Resume keeps rich text). Lists become "• " lines. */
export function htmlText(html) {
  const s = String(html || '');
  if (!/[<&]/.test(s)) return s;
  return s
    .replace(/<li[^>]*>/gi, '\n• ').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** Split rich text into a summary paragraph and bullet points. */
function splitBullets(text) {
  const lines = htmlText(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = [], para = [];
  for (const l of lines) (/^[•●▪◦‣\-*–]\s*/.test(l) ? bullets : para).push(l.replace(/^[•●▪◦‣\-*–]\s*/, ''));
  // Several plain lines and no bullets: they're the points.
  if (!bullets.length && para.length > 1 && para.every((x) => x.length < 220)) return { summary: '', highlights: para };
  return { summary: para.join(' '), highlights: bullets };
}

/** "BSc Computer Science" -> { studyType: 'BSc', area: 'Computer Science' }. */
export function degree(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(.*?(?:degree|diploma|certificate|bachelor'?s?|master'?s?)|[BM]\.?(?:Sc|A|Eng|Ed)\.?(?:\s*\(Hons\))?|Ph\.?D|MBA|LLB|LLM|PGCE|BS|MS|HND|HNC)\s+(?:in\s+|of\s+)?(.+)$/i);
  return m ? { studyType: m[1].trim(), area: m[2].trim() } : { studyType: t, area: '' };
}

function range(text) {
  const r = findRange(text || '');
  return r ? { startDate: r.start || '', endDate: r.single ? r.start : r.end } : { startDate: '', endDate: '' };
}

export function fromFresh(f) {
  const c = f.contact || {};
  const loc = f.location || {};
  const out = {
    basics: {
      name: f.name || '', label: (f.info && f.info.label) || '', summary: (f.info && (f.info.brief || f.info.quote)) || '',
      email: c.email || '', phone: c.phone || '', url: c.website || '', image: (f.info && f.info.image) || '',
      location: { city: loc.city || '', region: loc.region || '', countryCode: loc.country || '', address: loc.address || '', postalCode: loc.code || '' },
      profiles: (f.social || []).map((s) => ({ network: s.network || s.label || '', username: s.user || '', url: s.url || '' })),
    },
    work: ((f.employment && f.employment.history) || []).map((e) => ({ name: e.employer, position: e.position || e.title, url: e.url, startDate: e.start, endDate: e.end, summary: e.summary, highlights: e.highlights, location: e.location })),
    education: ((f.education && f.education.history) || []).map((e) => ({ institution: e.institution || e.title, area: e.area, studyType: e.studyType, startDate: e.start, endDate: e.end, score: e.grade || e.gpa, courses: e.curriculum, summary: e.summary })),
    skills: [
      ...((f.skills && f.skills.sets) || []).map((s) => ({ name: s.name, level: s.level, keywords: s.skills })),
      ...((f.skills && f.skills.list) || []).map((s) => ({ name: s.name, level: s.level, keywords: [] })),
    ],
    projects: (f.projects || []).map((p) => ({ name: p.title || p.name, description: p.summary || p.description, url: p.url, startDate: p.start, endDate: p.end, highlights: p.highlights, keywords: p.keywords })),
    languages: (f.languages || []).map((l) => ({ language: l.language, fluency: l.level || l.fluency })),
    interests: (f.interests || []).map((i) => ({ name: i.name, keywords: i.keywords })),
    awards: (f.recognition || []).map((a) => ({ title: a.title, awarder: a.from, date: a.date, summary: a.summary })),
    publications: (f.writing || []).map((w) => ({ name: w.title, publisher: w.publisher && (w.publisher.name || w.publisher), releaseDate: w.date, url: w.url, summary: w.summary })),
    certificates: (f.certifications || []).map((x) => ({ name: x.name || x.title, issuer: x.organization || x.issuer, date: x.date, url: x.url })),
    volunteer: ((f.service && f.service.history) || []).map((v) => ({ organization: v.organization, position: v.position, startDate: v.start, endDate: v.end, summary: v.summary, highlights: v.highlights })),
    references: (f.testimonials || f.references || []).map((r) => ({ name: r.name, reference: r.quote || r.reference || '' })),
  };
  return normalizeResume(out);
}

export function fromReactive(j) {
  const b = j.basics || {}, s = j.sections || {};
  const items = (k) => ((s[k] && s[k].items) || []).filter((x) => x.visible !== false);
  const href = (u) => (u && typeof u === 'object' ? u.href : u) || '';
  const out = {
    basics: {
      name: b.name, label: b.headline, email: b.email, phone: b.phone, url: href(b.url), image: (b.picture && b.picture.url) || '',
      location: { city: b.location || '' }, summary: htmlText(s.summary && s.summary.content),
      profiles: items('profiles').map((p) => ({ network: p.network, username: p.username, url: href(p.url) })),
    },
    work: items('experience').map((e) => ({ name: e.company, position: e.position, location: e.location, url: href(e.url), ...range(e.date), ...splitBullets(e.summary) })),
    education: items('education').map((e) => ({ institution: e.institution, studyType: e.studyType, area: e.area, score: e.score, url: href(e.url), ...range(e.date), summary: htmlText(e.summary) })),
    skills: items('skills').map((k) => ({ name: k.name, level: k.description, keywords: k.keywords })),
    languages: items('languages').map((l) => ({ language: l.name, fluency: l.description })),
    awards: items('awards').map((a) => ({ title: a.title, awarder: a.awarder, date: parseDate(a.date) || a.date, summary: htmlText(a.summary) })),
    certificates: items('certifications').map((c) => ({ name: c.name, issuer: c.issuer, date: parseDate(c.date) || c.date, url: href(c.url) })),
    interests: items('interests').map((i) => ({ name: i.name, keywords: i.keywords })),
    projects: items('projects').map((p) => ({ name: p.name, description: p.description, url: href(p.url), keywords: p.keywords, ...range(p.date), highlights: splitBullets(p.summary).highlights })),
    publications: items('publications').map((p) => ({ name: p.name, publisher: p.publisher, releaseDate: parseDate(p.date) || p.date, url: href(p.url), summary: htmlText(p.summary) })),
    volunteer: items('volunteer').map((v) => ({ organization: v.organization, position: v.position, url: href(v.url), ...range(v.date), ...splitBullets(v.summary) })),
    references: items('references').map((r) => ({ name: [r.name, r.description].filter(Boolean).join(', '), reference: htmlText(r.summary) })),
  };
  return normalizeResume(out);
}

/* ---------- LinkedIn data export ---------- */

const LI_MONTH = (s) => {
  if (!s) return '';
  const d = parseDate(s);
  return d == null ? '' : d;
};

/** LinkedIn's export zip (Profile.csv, Positions.csv…) as files Map(name -> loader). */
export async function fromLinkedIn(files) {
  const dec = new TextDecoder();
  const read = async (name) => {
    const key = [...files.keys()].find((k) => k.split('/').pop().toLowerCase() === name.toLowerCase());
    return key ? dec.decode(await files.get(key)()) : '';
  };
  const profile = csvObjects(await read('Profile.csv'), 'First Name')[0] || {};
  const emails = csvObjects(await read('Email Addresses.csv'), 'Email Address');
  const phones = csvObjects(await read('PhoneNumbers.csv'), 'Number');
  const out = {
    basics: {
      name: [profile['First Name'], profile['Last Name']].filter(Boolean).join(' '), label: profile.Headline || '', summary: profile.Summary || '',
      email: ((emails.find((e) => /yes/i.test(e.Primary || '')) || emails[0]) || {})['Email Address'] || '',
      phone: (phones[0] || {}).Number || '',
      location: (() => { const [city, ...rest] = String(profile['Geo Location'] || profile.Address || '').split(/\s*,\s*/); return { city: city || '', region: rest.join(', ') }; })(),
      profiles: [],
      url: ((profile.Websites || '').match(/https?:\/\/[^\s,\]]+/) || [''])[0],
    },
    work: csvObjects(await read('Positions.csv'), 'Company Name').map((p) => ({
      name: p['Company Name'], position: p.Title, location: p.Location, startDate: LI_MONTH(p['Started On']), endDate: LI_MONTH(p['Finished On']),
      ...splitBullets(p.Description || ''),
    })),
    education: csvObjects(await read('Education.csv'), 'School Name').map((e) => ({
      institution: e['School Name'], ...degree(e['Degree Name']), startDate: LI_MONTH(e['Start Date']), endDate: LI_MONTH(e['End Date']), summary: [e.Notes, e.Activities].filter(Boolean).join(' '),
    })),
    languages: csvObjects(await read('Languages.csv'), 'Name').map((l) => ({ language: l.Name, fluency: l.Proficiency })),
    certificates: csvObjects(await read('Certifications.csv'), 'Name').map((c) => ({ name: c.Name, issuer: c.Authority, date: LI_MONTH(c['Started On']), url: c.Url })),
    projects: csvObjects(await read('Projects.csv'), 'Title').map((p) => ({ name: p.Title, description: p.Description, url: p.Url, startDate: LI_MONTH(p['Started On']), endDate: LI_MONTH(p['Finished On']) })),
    awards: csvObjects(await read('Honors.csv'), 'Title').map((h) => ({ title: h.Title, summary: h.Description, date: LI_MONTH(h['Issued On']) })),
    publications: csvObjects(await read('Publications.csv'), 'Name').map((p) => ({ name: p.Name, publisher: p.Publisher, releaseDate: LI_MONTH(p['Published On']), url: p.Url, summary: p.Description })),
    volunteer: csvObjects(await read('Volunteering.csv'), 'Company Name').map((v) => ({ organization: v['Company Name'], position: v.Role, startDate: LI_MONTH(v['Started On']), endDate: LI_MONTH(v['Finished On']), summary: v.Description })),
  };
  const skills = csvObjects(await read('Skills.csv'), 'Name').map((s) => s.Name).filter(Boolean);
  out.skills = skills.length ? [{ name: 'Skills', keywords: skills }] : [];
  // LinkedIn lists the newest role first already; drop empty rows.
  out.work = out.work.filter((w) => w.name || w.position);
  return normalizeResume(out);
}

/** Does this zip look like a LinkedIn export? */
export function isLinkedInZip(files) {
  const names = [...files.keys()].map((k) => k.split('/').pop());
  return names.includes('Profile.csv') || names.includes('Positions.csv');
}
