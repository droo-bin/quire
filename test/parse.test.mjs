// Unit tests for the parts that don't need a browser: dates, reading CV text, structured formats, the
// writing checks, job matching, JSON Resume round trips and the PDF writer.
//
//   node --test test/*.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDate, findRange, formatRange, duration } from '../src/lib/dates.js';
import { parseCv, textLines, roleParts, headingSection } from '../src/import/text.js';
import { fromFresh, fromReactive, detectJson, htmlText, degree } from '../src/import/formats.js';
import { newDoc, toJsonResume, fromJsonResume, normalizeResume, allText } from '../src/lib/model.js';
import { runChecks } from '../src/check/checks.js';
import { pastTense, leadingVerb } from '../src/check/words.js';
import { matchJob, extractTerms } from '../src/check/match.js';
import { parseTTF, subsetTTF } from '../src/export/ttf.js';
import { PdfWriter } from '../src/export/pdfwriter.js';
import { parseCSV } from '../src/lib/csv.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

test('dates as people write them', () => {
  const cases = { 'Sept 2019': '2019-09', 'September, 2019': '2019-09', '03/2018': '2018-03', '2018-3': '2018-03', '2016': '2016', 'Present': '', 'current': '', 'Summer 2018': '2018-06', "Jan '21": '2021-01', '12/25/2020': '2020-12-25', '1st March 2020': '2020-03-01', 'hello': null };
  for (const [text, want] of Object.entries(cases)) assert.equal(parseDate(text), want, text);
  assert.deepEqual(pick(findRange('Senior Engineer, Acme (Jan 2019 – Present)')), { start: '2019-01', end: '' });
  assert.deepEqual(pick(findRange('2016-2019')), { start: '2016', end: '2019' });
  assert.deepEqual(pick(findRange('from March 2015 to June 2017')), { start: '2015-03', end: '2017-06' });
  assert.deepEqual(pick(findRange('Since 2020')), { start: '2020', end: '' });
  assert.equal(formatRange('2019-09', '', 'mon-yyyy'), 'Sep 2019 – Present');
  assert.equal(formatRange('2019-09', '2021-01', 'month-yyyy'), 'September 2019 – January 2021');
  assert.equal(duration('2020-01', '2021-06'), '1 yr 6 mos');
});
const pick = (r) => ({ start: r.start, end: r.end });

test('reads a plain-text CV into sections and entries', () => {
  const { resume, report } = parseCv(textLines(fixture('sample-cv.txt').toString()));
  const b = resume.basics;
  assert.equal(b.name, 'Sam Taylor');
  assert.equal(b.label, 'Senior Data Engineer');
  assert.equal(b.email, 'sam.taylor@example.com');
  assert.equal(b.phone, '07700 900123');
  assert.equal(b.location.city, 'Leeds');
  assert.deepEqual(b.profiles.map((p) => p.network), ['LinkedIn', 'GitHub']);
  assert.match(b.summary, /^Data engineer with eight years.*something people trust\.$/);
  assert.equal(resume.work.length, 3);
  assert.deepEqual([resume.work[0].position, resume.work[0].name, resume.work[0].startDate, resume.work[0].endDate], ['Senior Data Engineer', 'Northwind Retail Ltd', '2021-03', '']);
  assert.equal(resume.work[0].highlights.length, 3, 'a wrapped bullet is joined back together');
  assert.match(resume.work[0].highlights[0], /24 hours to 15 minutes\.$/);
  assert.deepEqual([resume.work[1].position, resume.work[1].name, resume.work[1].endDate], ['Data Engineer', 'Leeds City Council', '2021-02']);
  assert.deepEqual([resume.work[2].position, resume.work[2].name], ['Analyst', 'Example Insights']);
  assert.deepEqual([resume.education[0].studyType, resume.education[0].area, resume.education[0].institution, resume.education[0].score], ['BSc', 'Mathematics', 'University of York', 'First Class Honours']);
  assert.deepEqual([resume.education[1].studyType, resume.education[1].area, resume.education[1].score], ['A Levels', 'Maths, Physics, Chemistry', 'A*AA']);
  assert.deepEqual(resume.skills.map((s) => s.name), ['Languages', 'Tools', 'Other']);
  assert.equal(resume.certificates[0].issuer, 'Amazon Web Services');
  assert.deepEqual(resume.languages.map((l) => l.language), ['English', 'French']);
  assert.equal(resume.interests.length, 3);
  assert.equal(resume.references.length, 0, '"Available on request" is dropped');
  assert.ok(report.found.includes('email'));
});

test('title, dates, then employer on their own lines; publications that wrap', () => {
  const cv = `Jo Fielding
Lead Engineer - Platform Engineering
Bristol, England | jo@example.com

Experience
Lead Engineer
Aug 2025 – Present
Fernleaf
Led the platform team.
• Cut deploy time by half.
DevOps Engineer and Team Lead
Oct 2024 – Aug 2025
Fernleaf
• Ran the on-call rota.
Senior Software Engineering Consultant
Oct 2022 – Apr 2024
Northwind
• Moved services to containers.
Platform Engineer (Contractor)
Aug 2022 – Jan 2023
Example Co
• Built HR integrations.

Education
Bachelor of Science (BSc) Psychology
Example University
1st Class
2010 – 2013

Publications
• Yet Another Guide to Containers (Medium)
• Chaos Testing Your HTTP Micro-
  Services (Medium)
• Java to C# - C# to Java (Medium)
• "Catch Me If You Can" - A Guide to Debugging
`;
  const { resume } = parseCv(textLines(cv));
  assert.deepEqual(resume.work.map((w) => [w.position, w.name, w.startDate, w.endDate]), [
    ['Lead Engineer', 'Fernleaf', '2025-08', ''],
    ['DevOps Engineer and Team Lead', 'Fernleaf', '2024-10', '2025-08'],
    ['Senior Software Engineering Consultant', 'Northwind', '2022-10', '2024-04'],
    ['Platform Engineer (Contractor)', 'Example Co', '2022-08', '2023-01'],
  ]);
  const e = resume.education[0];
  assert.deepEqual([e.studyType, e.area, e.institution, e.score, e.startDate, e.endDate], ['Bachelor of Science (BSc)', 'Psychology', 'Example University', '1st Class', '2010', '2013']);
  assert.deepEqual(resume.publications.map((x) => [x.name, x.publisher]), [
    ['Yet Another Guide to Containers', 'Medium'],
    ['Chaos Testing Your HTTP Micro-Services', 'Medium'],
    ['Java to C# - C# to Java', 'Medium'],
    ['"Catch Me If You Can" - A Guide to Debugging', ''],
  ]);
});

test('tells job titles from employers', () => {
  assert.deepEqual(pickRole(roleParts(['Acme Ltd – Software Engineer'])), ['Software Engineer', 'Acme Ltd']);
  assert.deepEqual(pickRole(roleParts(['Product Manager at Fernleaf'])), ['Product Manager', 'Fernleaf']);
  assert.deepEqual(pickRole(roleParts(['Barista | Bean Counter Café | Leeds'])), ['Barista', 'Bean Counter Café']);
  assert.equal(roleParts(['Barista | Bean Counter Café | Leeds']).location, 'Leeds');
  assert.equal(headingSection('Employment History:'), 'work');
  assert.equal(headingSection('KEY SKILLS'), 'skills');
  assert.equal(headingSection('Hobbies & Interests'), 'interests');
});
const pickRole = (r) => [r.title, r.company];

test('structured formats', () => {
  const fresh = JSON.parse(fixture('fresh.json'));
  assert.equal(detectJson(fresh), 'fresh');
  const f = fromFresh(fresh);
  assert.equal(f.basics.name, 'Robin Hart');
  assert.equal(f.work[0].name, 'Minster Insight');
  assert.deepEqual(f.skills[0].keywords, ['SQL', 'Python', 'Power BI']);
  const rx = JSON.parse(fixture('reactive.json'));
  assert.equal(detectJson(rx), 'reactive');
  const r = fromReactive(rx);
  assert.deepEqual(r.work[0].highlights, ['Grew the newsletter to 40,000 readers.', 'Ran a team of three.']);
  assert.equal(r.work[0].startDate, '2020-01');
  assert.equal(r.basics.summary, 'Marketer with a soft spot for email.');
  assert.equal(htmlText('<p>a &amp; b</p><ul><li>one</li></ul>'), 'a & b\n\n• one');
  assert.deepEqual(degree('BSc Computer Science'), { studyType: 'BSc', area: 'Computer Science' });
  assert.deepEqual(parseCSV('a,b\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
});

test('JSON Resume round trip keeps everything, and exports only what is shown', () => {
  const doc = newDoc(JSON.parse(readFileSync(new URL('../src/examples/example.json', import.meta.url))));
  doc.hidden['work.2'] = true;
  doc.hidden['work.0.highlights.2'] = true;
  doc.layout.template = 'classic';
  doc.custom.push({ id: 'abc', title: 'Speaking', items: [{ title: 'Talk', subtitle: '', location: '', startDate: '', endDate: '', url: '', summary: '', highlights: [] }] });
  const json = toJsonResume(doc);
  assert.equal(json.work.length, 2, 'hidden job left out');
  assert.equal(json.work[0].highlights.length, 2, 'hidden bullet left out');
  assert.equal(json.meta.quire.layout.template, 'classic');
  const back = fromJsonResume(JSON.parse(JSON.stringify(json)));
  assert.equal(back.resume.work.length, 3, 'the full CV comes back');
  assert.ok(back.hidden['work.2']);
  assert.equal(back.custom[0].title, 'Speaking');
  // A plain JSON Resume from elsewhere.
  const plain = fromJsonResume({ basics: { name: 'A', location: 'Leeds' }, work: [{ company: 'Old Co', startDate: 'Jan 2019' }] });
  assert.equal(plain.resume.work[0].name, 'Old Co');
  assert.equal(plain.resume.work[0].startDate, '2019-01');
  assert.equal(plain.resume.basics.location.city, 'Leeds');
  assert.match(allText(doc), /Harbourside Digital/);
});

test('writing checks find problems and fix them', () => {
  const doc = newDoc(normalizeResume({
    basics: { name: 'T', email: 'not-an-email', summary: 'I am a hard-working team player.' },
    work: [
      { name: 'B Co', position: 'Clerk', startDate: '2015-01', endDate: '2016-01', highlights: ['Manage the javascript filing system', 'Responsible for post.'] },
      { name: 'A Co', position: 'Manager', startDate: '2018-01', endDate: '', highlights: ['Led a team.', 'Ran the office'] },
    ],
    skills: [{ name: 'Skills', keywords: ['Excel', 'excel', 'Word'] }],
  }));
  const checks = runChecks(doc, { pages: 3 });
  const titles = checks.map((c) => c.title + ' ' + c.detail).join('\n');
  for (const want of [/Check your email/, /Start with what you did, not "Responsible for"/, /past tense/, /say very little/, /JavaScript/, /newest first/, /Remove repeated skills/, /3 pages/, /gap before Manager/, /Add a number/]) assert.match(titles, want);
  const tense = checks.find((c) => /past tense/.test(c.title));
  tense.fix.run(doc);
  assert.equal(doc.resume.work[0].highlights[0], 'Managed the javascript filing system');
  checks.find((c) => /newest first/.test(c.title)).fix.run(doc);
  assert.equal(doc.resume.work[0].name, 'A Co');
  checks.find((c) => /repeated skills/.test(c.title)).fix.run(doc);
  assert.deepEqual(doc.resume.skills[0].keywords, ['Excel', 'Word']);
  assert.equal(pastTense('plan'), 'planned');
  assert.equal(pastTense('lead'), 'led');
  assert.equal(pastTense('apply'), 'applied');
  assert.deepEqual(leadingVerb('Managing a team'), { word: 'Managing', base: 'manage', form: 'ing' });
});

test('job matching', () => {
  const cv = 'Built pipelines in Python and SQL with Airflow. Mentored engineers. Managed stakeholders. Used JS daily.';
  const job = 'Essential: Python, SQL, Kubernetes and JavaScript. You will have experience of stakeholder management and mentoring.';
  const m = matchJob(cv, job);
  const found = Object.fromEntries(m.terms.map((t) => [t.label, t.found]));
  assert.equal(found.Python, true);
  assert.equal(found.Kubernetes, false);
  assert.equal(found.JavaScript, true, 'JS counts as JavaScript');
  assert.equal(found['stakeholder management'], true, 'word forms and synonyms count');
  assert.ok(m.score > 50 && m.score < 100);
  assert.deepEqual(extractTerms(''), []);
});

test('fonts subset and a PDF is written', async () => {
  const bytes = new Uint8Array(readFileSync(new URL('../src/vendor/fonts/Lora-Regular.ttf', import.meta.url)));
  const font = parseTTF(bytes);
  const used = new Set([...'Héllo'].map((c) => font.glyph(c.codePointAt(0))));
  assert.ok(![...used].includes(0), 'all characters found');
  const sub = subsetTTF(font, used);
  assert.ok(sub.length < bytes.length / 2, `subset is smaller (${sub.length} vs ${bytes.length})`);
  const again = parseTTF(sub);
  assert.equal(again.glyph('H'.codePointAt(0)), font.glyph('H'.codePointAt(0)));
  assert.equal(again.advances[font.glyph(101)], font.advances[font.glyph(101)]);

  const pdf = new PdfWriter();
  const f = pdf.font('lora', bytes);
  const page = pdf.page(595.28, 841.89);
  page.rect(10, 10, 100, 20, [32, 69, 200], 4);
  page.textRun(f, 12, 800, [{ x: 40, str: 'Hello' }, { x: 75, str: 'wörld' }], { color: [0, 0, 0] });
  page.link(40, 790, 60, 14, 'https://example.com/a b');
  pdf.attach('resume.json', new TextEncoder().encode('{"basics":{"name":"X"}}'));
  pdf.info({ title: 'Test – CV', author: 'X' });
  const out = await pdf.save();
  const text = new TextDecoder('latin1').decode(out);
  assert.ok(text.startsWith('%PDF-1.7'));
  assert.match(text, /\/Subtype \/CIDFontType2/);
  assert.match(text, /\/EmbeddedFiles/);
  assert.match(text, /startxref\n\d+\n%%EOF\n$/);
  // The xref offsets point at real objects.
  const xref = text.slice(text.lastIndexOf('xref'));
  const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => +m[1]);
  for (const [i, o] of offsets.entries()) assert.ok(text.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1} at ${o}`);
});

test('files from anywhere are made safe to open', async () => {
  const { sanitizeDoc } = await import('../src/lib/model.js');
  const { toText } = await import('../src/export/text.js');
  const bad = fromJsonResume({ basics: { name: 'Z', image: 'https://tracker.example/me.jpg' }, meta: { quire: { full: { basics: { name: 'Z', image: 'https://x/y.png' } }, custom: [{ id: 'x', title: 'T' }, null], layout: { font: 'zzz', template: 'nope', accent: '"/><b>', titles: null, side: null, order: 'bad', fit: 9 }, hidden: 'nope' } } });
  assert.equal(bad.layout.font, '');
  assert.equal(bad.layout.template, 'modern');
  assert.equal(bad.layout.accent, '');
  assert.deepEqual(bad.layout.titles, {});
  assert.equal(bad.layout.fit, 0);
  assert.deepEqual(bad.custom[0].items, []);
  assert.deepEqual(bad.hidden, {});
  assert.equal(bad.resume.basics.image, '', 'pictures from the web are not kept');
  assert.ok(bad.layout.order.includes('custom:x'));
  // Hidden sections stay out of every export.
  const doc = newDoc(JSON.parse(readFileSync(new URL('../src/examples/example.json', import.meta.url))));
  doc.layout.hiddenSections = { interests: true, summary: true };
  const text = toText(doc);
  assert.doesNotMatch(text, /INTERESTS|Allotment growing|seven years/);
  const json = toJsonResume(doc);
  assert.equal(json.interests, undefined);
  assert.equal(json.basics.summary, undefined);
  sanitizeDoc(doc);
  assert.ok(doc.layout.hiddenSections.interests);
});
