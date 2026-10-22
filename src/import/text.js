// Reading a CV that was written for people, not machines. PDF and Word imports turn the file into lines
// (with font size, bold and indent where known); this works out the name, contact details, sections and
// entries from those lines. It's a best effort: the import report says what it was unsure about.

import { normalizeResume, uid } from '../lib/model.js';
import { findRange, isDateLine, parseDate } from '../lib/dates.js';

/* ---------- vocabularies ---------- */

const HEADINGS = {
  summary: ['summary', 'profile', 'professional summary', 'personal profile', 'personal statement', 'career summary', 'professional profile', 'about me', 'about', 'objective', 'career objective', 'overview', 'introduction', 'executive summary', 'career profile', 'summary of qualifications'],
  work: ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'career history', 'career', 'relevant experience', 'professional background', 'positions held', 'experience and employment', 'industry experience', 'career experience', 'professional history', 'roles'],
  education: ['education', 'education and training', 'qualifications', 'academic background', 'academic qualifications', 'education & qualifications', 'education and qualifications', 'academic history', 'training', 'academic record', 'degrees'],
  skills: ['skills', 'key skills', 'technical skills', 'core skills', 'core competencies', 'competencies', 'areas of expertise', 'expertise', 'skills and abilities', 'skills & abilities', 'technologies', 'tools', 'tech stack', 'technical proficiencies', 'skills summary', 'strengths', 'key strengths', 'skills and expertise', 'technical expertise', 'abilities', 'it skills', 'software', 'programming languages', 'programming / scripting languages', 'programming and scripting languages', 'scripting languages', 'coding languages', 'computer languages', 'languages and frameworks', 'languages and tools', 'tools and technologies', 'technology', 'tech', 'technical', 'technical summary', 'technology stack', 'toolkit', 'stack'],
  projects: ['projects', 'personal projects', 'key projects', 'selected projects', 'side projects', 'portfolio', 'project experience', 'open source'],
  certificates: ['certifications', 'certificates', 'licences', 'licenses', 'licences and certifications', 'licenses & certifications', 'professional certifications', 'accreditations', 'professional qualifications', 'courses', 'courses and certifications', 'professional development', 'continuing education'],
  awards: ['awards', 'honours', 'honors', 'awards and honours', 'awards & honors', 'achievements', 'key achievements', 'accomplishments', 'recognition', 'prizes', 'scholarships'],
  publications: ['publications', 'papers', 'research', 'publications and presentations', 'talks', 'presentations', 'speaking', 'writing', 'articles'],
  languages: ['languages', 'language skills', 'spoken languages'],
  volunteer: ['volunteering', 'volunteer experience', 'voluntary work', 'volunteer work', 'community involvement', 'community', 'charity work', 'extracurricular activities', 'extra-curricular activities', 'positions of responsibility', 'leadership'],
  interests: ['interests', 'hobbies', 'hobbies and interests', 'interests and hobbies', 'hobbies & interests', 'personal interests', 'outside work', 'activities', 'other interests'],
  references: ['references', 'referees'],
  _personal: ['personal details', 'personal information', 'contact', 'contact details', 'contact information', 'details', 'info'],
};
const HEADING_INDEX = new Map(Object.entries(HEADINGS).flatMap(([id, words]) => words.map((w) => [w, id])));

const TITLE_WORDS = /\b(engineer|developer|manager|director|analyst|assistant|associate|consultant|designer|architect|lead|head|officer|specialist|coordinator|co-ordinator|administrator|executive|technician|scientist|researcher|teacher|lecturer|professor|nurse|doctor|accountant|advisor|adviser|intern|internship|trainee|apprentice|graduate|founder|co-founder|owner|president|vp|vice president|chief|cto|ceo|cfo|coo|partner|supervisor|representative|agent|clerk|editor|writer|producer|planner|buyer|controller|auditor|surveyor|strategist|programmer|tester|qa|sre|devops|operator|practitioner|therapist|pharmacist|solicitor|lawyer|paralegal|barrister|tutor|instructor|coach|volunteer|ambassador|secretary|receptionist|chef|cook|server|barista|cashier|sales|marketing|recruiter|support|staff|principal|senior|junior|fellow|postdoc|phd|student|mentor|steward|treasurer|chair|trustee|member|contractor|freelance|freelancer|self-employed|worker|operative|handler|driver|carer|care assistant|nanny|attendant|inspector|estimator|scheduler|dispatcher|underwriter|actuary|economist|statistician|librarian|curator|artist|photographer|animator|illustrator|musician|journalist|reporter|copywriter|translator|interpreter)s?\b/i;
const COMPANY_WORDS = /\b(ltd|limited|inc|incorporated|llc|llp|plc|gmbh|s\.?a\.?|corp|corporation|company|co\.|group|holdings|partners|consulting|consultancy|solutions|services|technologies|technology|systems|labs|studio|studios|agency|bank|council|nhs|trust|foundation|university|college|school|institute|hospital|charity|society|association|ministry|department|government|authority|police|army|navy|raf|bbc|ventures|capital|media|digital|software|networks|international|global|industries|enterprises|retail|stores|club)\b/i;
const PLACES = /\b(remote|hybrid|on-?site|london|manchester|birmingham|coventry|leeds|liverpool|bristol|sheffield|newcastle|nottingham|leicester|edinburgh|glasgow|cardiff|belfast|dublin|cambridge|oxford|brighton|reading|milton keynes|york|bath|exeter|southampton|portsmouth|norwich|aberdeen|dundee|swansea|derby|wolverhampton|stoke|sunderland|plymouth|hull|bradford|wakefield|huddersfield|preston|blackpool|bolton|stockport|salford|warrington|chester|lancaster|durham|middlesbrough|gloucester|cheltenham|swindon|luton|watford|slough|guildford|canterbury|maidstone|ipswich|colchester|chelmsford|peterborough|northampton|worcester|hereford|shrewsbury|telford|lincoln|carlisle|inverness|stirling|newport|wrexham|derry|harrogate|solihull|warwick|leamington spa|rugby|nuneaton|bournemouth|poole|truro|winchester|salisbury|basingstoke|crawley|croydon|sheffield|doncaster|rotherham|barnsley|halifax|blackburn|burnley|wigan|oldham|rochdale|st albans|stevenage|bedford|high wycombe|aylesbury|farnborough|woking|reading|bracknell|hemel hempstead|southend|brentford|london bridge|new york|san francisco|seattle|boston|chicago|austin|los angeles|toronto|vancouver|sydney|melbourne|berlin|paris|amsterdam|madrid|barcelona|lisbon|stockholm|copenhagen|zurich|munich|singapore|hong kong|tokyo|bangalore|bengaluru|mumbai|delhi|uk|united kingdom|england|scotland|wales|northern ireland|ireland|usa|united states|us|canada|australia|germany|france|spain|netherlands|india)\b/i;
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/;
const INSTITUTION = /\b(universit(y|ies|é|at)|college|school|academy|institute|polytechnic|sixth form|conservatoire|business school|lyc[eé]e|gymnasium|open university)\b/i;
const DEGREE = /\b(b\.?sc|b\.?a|b\.?eng|m\.?eng|m\.?sc|m\.?a|m\.?b\.?a|ph\.?d|d\.?phil|m\.?phil|m\.?res|ll\.?b|ll\.?m|pgce|pgdip|pg ?cert|hnd|hnc|btec|nvq|a[ -]?levels?|as[ -]?levels?|gcses?|igcses?|o[ -]?levels?|highers|advanced highers|ib|international baccalaureate|b\.s|m\.s|bachelor('?s)?|master('?s)?|doctorate|diploma|certificate|foundation degree|associate('?s)? degree|degree|honours|hons|bs|ms|ma|ba|bsc|msc|meng|beng|mba|phd)\b/i;
const GRADE = /\b((?:first|1st)[- ]class( honou?rs)?|first|1st|2[:.]1|2[:.]2|upper second|lower second|third|distinction|merit|pass|summa cum laude|magna cum laude|cum laude|gpa[:\s]*[\d.]+(\s*\/\s*[\d.]+)?|[\d.]+\s*gpa|grade[:\s]+\S+|[A*]{1,2}[A-E]{0,3}\b(?=\s|,|$)|\d+\s*ucas points)\b/i;
const BULLET = /^\s*([•●▪◦‣■□➢➤►▸▹○◆◇✓✔→*·]|o(?=\s+[A-Z0-9])|[-–—](?=\s)|\d{1,2}[.)](?=\s)|[a-z][.)](?=\s))\s*/;
const PROFILE_SITES = [
  ['LinkedIn', /linkedin\.com\/(in|pub)\/[^\s/?#|,]+/i], ['GitHub', /github\.com\/[^\s/?#|,]+/i], ['GitLab', /gitlab\.com\/[^\s/?#|,]+/i],
  ['X', /(twitter|x)\.com\/[^\s/?#|,]+/i], ['Behance', /behance\.net\/[^\s/?#|,]+/i], ['Dribbble', /dribbble\.com\/[^\s/?#|,]+/i],
  ['Medium', /medium\.com\/@?[^\s/?#|,]+/i], ['Stack Overflow', /stackoverflow\.com\/users\/[^\s?#|,]+/i], ['Kaggle', /kaggle\.com\/[^\s/?#|,]+/i],
  ['ORCID', /orcid\.org\/[\d-X]+/i], ['Mastodon', /@[\w]+@[\w.-]+\.[a-z]{2,}/i],
];
const EMAIL = /[\w.+'-]+@[\w-]+(\.[\w-]+)+/;
const PHONE = /(?:\+|\(?0)[\d\s().-]{8,}\d|\(\d{3}\)\s*\d{3}[\s.-]\d{4}\b|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|co\.uk|org|org\.uk|net|io|dev|me|uk|app|page|site|xyz|ai|tech|design|info|blog|eu|de|fr|ie|ca|au|github\.io)(?:\/[^\s|,]*)?)/i;

const norm = (s) => String(s || '').toLowerCase().replace(/[:.]+$/, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
const capitalised = (s) => /^[A-Z]/.test(s);

/** Which section a heading names, or null. */
export function headingSection(text, strict = false) {
  // "2. Education", "— Experience —", "Skills ____", "#Projects"
  const t = norm(String(text || '').replace(/^\s*(?:\d{1,2}[.)]|[ivx]{1,4}[.)]|[#>*•·|–—=_~-]+)\s*/i, '').replace(/[\s_|–—=*#~:.-]+$/, '')).replace(/\s*\(.*\)$/, '');
  if (HEADING_INDEX.has(t)) return HEADING_INDEX.get(t);
  const t2 = t.replace(/^(my|key|relevant|selected|other|additional|professional)\s+/, '');
  if (HEADING_INDEX.has(t2)) return HEADING_INDEX.get(t2);
  // "Teaching Experience", "Clinical Skills", "Research Publications": the last word says what it is.
  if (!strict && words(t2).length <= 4 && !/[,;\d@]/.test(t2)) {
    if (/\b(volunteer(ing)?|voluntary|charity)\b/.test(t2)) return 'volunteer';
    const last = [[/\b(experience|employment|work history|career history)$/, 'work'], [/\b(education|qualifications|training)$/, 'education'], [/\bskills$/, 'skills'],
      [/\bprojects$/, 'projects'], [/\b(awards|achievements)$/, 'awards'], [/\b(certifications?|certificates|licen[cs]es)$/, 'certificates'],
      [/\b(publications|papers|articles)$/, 'publications'], [/\b(interests|hobbies)$/, 'interests'], [/\blanguages$/, 'languages']];
    for (const [re, id] of last) if (re.test(t2)) return id;
  }
  return null;
}

/* ---------- lines ---------- */

// Icon fonts (Font Awesome and friends) put a picture in front of contact details. The picture is a
// private-use character; it's dropped, but it says what the text next to it is.
const ICONS = {
  linkedin: [0xf08c, 0xf0e1, 0xe5dc], github: [0xf09b, 0xf113, 0xf092], twitter: [0xf099, 0xf081, 0xe61b, 0xe61a],
  email: [0xf003, 0xf0e0, 0xf199, 0xf2b6, 0xf658], phone: [0xf095, 0xf098, 0xf10b, 0xf3cd, 0xf879, 0xf2a0, 0xf232],
  web: [0xf0ac, 0xf57d, 0xf0c1, 0xf08e], location: [0xf041, 0xf3c5, 0xf015, 0xf1ad, 0xf124, 0xf279], medium: [0xf23a, 0xf3c7], gitlab: [0xf296],
};
const ICON_OF = new Map(Object.entries(ICONS).flatMap(([k, codes]) => codes.map((c) => [c, k])));
const PRIVATE_USE = /[\ue000-\uf8ff]/g;
const BULLET_PUA = new Set([0xf0b7, 0xf0a7, 0xf0a8, 0xf0d8, 0xf076, 0xf0fc, 0xf0d2, 0xf0e8, 0xf06e, 0xf0be]);

/** Clean lines: { text, size, bold, x, bullet, heading, gap, icon } with bullets detected and page furniture removed. */
export function prepareLines(raw) {
  const out = [];
  for (const l of raw) {
    let src = String(l.text || '');
    // Symbol and Wingdings bullets come out of PDFs as private-use characters too.
    const lead = src.trimStart().codePointAt(0);
    if (BULLET_PUA.has(lead) || (lead >= 0xe000 && lead <= 0xf8ff && !ICON_OF.has(lead) && words(src).length > 4)) src = '• ' + src.trimStart().slice(1);
    const pua = src.match(PRIVATE_USE);
    const icon = pua ? ICON_OF.get(pua[0].codePointAt(0)) || 'other' : null;
    let text = src.replace(PRIVATE_USE, ' ').replace(/\u00a0/g, ' ').replace(/[\u200b\ufeff]/g, '').replace(/ {3,}|\t+/g, '\t').replace(/[^\S\t]+/g, ' ').replace(/\s*\t\s*/g, '\t').trim();
    if (!text) continue;
    // "E X P E R I E N C E", "W O R K   H I S T O R Y": letter-spaced headings.
    if (/^(?:[A-Za-z&]\s+){3,}[A-Za-z&]$/.test(text.replace(/\t/g, '   '))) text = text.replace(/\t/g, '   ').split(/\s{2,}/).map((w) => w.replace(/\s+/g, '')).join(' ');
    text = text.replace(/\s*[·|•–—-]?\s*\bpage\s+\d+\s*(of|\/)\s*\d+\b\s*/i, ' ').replace(/\s*[·|•–—-]\s*(curriculum vitae|cv|résumé|resume)$|^(curriculum vitae|cv|résumé|resume)\s*[·|•–—:-]\s*/i, '').trim();
    if (!text) continue;
    if (/^(page\s*)?\d+\s*(of|\/)\s*\d+$/i.test(text) || /^curriculum vitae$|^(cv|résumé|resume)$/i.test(text)) continue;
    if (/^[-_=.•·*~\s]{3,}$/.test(text)) continue;
    let bullet = !!l.bullet;
    const m = text.match(BULLET);
    if (m && text.length > m[0].length + 1 && !/^\d{4}/.test(text) && !(/^\d{1,2}[.)]/.test(text) && !l.bullet && /^\d{1,2}[.)]\s*\d/.test(text))) { bullet = true; text = text.slice(m[0].length).trim(); }
    out.push({ ...l, text, bullet, ...(icon ? { icon } : {}) });
  }
  // Web addresses that wrapped ("linkedin.com/in/alex-" / "example").
  for (let i = out.length - 2; i >= 0; i--) {
    const a = out[i], b = out[i + 1];
    if (/(\.[a-z]{2,}|\/)\S*[-/_.]$/i.test(a.text) && /^[\w./-]+$/.test(b.text) && !/\s/.test(a.text.split(/\s+/).pop() + b.text) && b.text.length < 30) { a.text += b.text; out.splice(i + 1, 1); }
  }
  return out;
}

/** A median font size, so headings and names can be told from body text. */
function bodySize(lines) {
  const s = lines.map((l) => l.size).filter((x) => x > 0).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

function isHeadingLine(l, body) {
  const t = l.text.replace(/[:|]+$/, '').trim();
  if (headingSection(t)) return true;
  if (l.heading) return words(t).length <= 7;
  if (l.bullet || words(t).length > 5 || /[.,;]$/.test(l.text) || findRange(t) || EMAIL.test(t) || /\d{3,}/.test(t)) return false;
  const big = body && l.size > body * 1.12;
  const caps = t.length > 2 && t === t.toUpperCase() && /[A-Z]{3}/.test(t);
  return !!((big && (l.bold || caps)) || (caps && (l.bold || big)));
}

/* ---------- the header: name and contact details ---------- */

const NETWORKS = {
  linkedin: ['LinkedIn', (u) => `https://www.linkedin.com/in/${u}`], github: ['GitHub', (u) => `https://github.com/${u}`],
  gitlab: ['GitLab', (u) => `https://gitlab.com/${u}`], twitter: ['Twitter', (u) => `https://x.com/${u}`], x: ['X', (u) => `https://x.com/${u}`],
  medium: ['Medium', (u) => `https://medium.com/@${u}`], instagram: ['Instagram', (u) => `https://www.instagram.com/${u}`],
  bluesky: ['Bluesky', (u) => `https://bsky.app/profile/${u}`], mastodon: ['Mastodon', () => ''], behance: ['Behance', (u) => `https://www.behance.net/${u}`],
  dribbble: ['Dribbble', (u) => `https://dribbble.com/${u}`], kaggle: ['Kaggle', (u) => `https://www.kaggle.com/${u}`],
};
// "Twitter: @jo_codes", "GitHub - jocodes", "LinkedIn: jo-bloggs"
const HANDLE = /\b(linkedin|github|gitlab|twitter|medium|instagram|bluesky|mastodon|behance|dribbble|kaggle)\s*(?::|-|–|—)\s*(@?[\w][\w.-]*(?:@[\w.-]+\.[a-z]{2,})?)/i;

function addProfile(key, handle, basics, found) {
  const [network, url] = NETWORKS[key.toLowerCase()];
  const username = handle.replace(/^@/, '').replace(/[.,;]+$/, '');
  if (!username || basics.profiles.some((p) => p.network === network)) return;
  basics.profiles.push({ network, username, url: url(username) });
  found.add(network);
}

/** A bare handle next to a LinkedIn/GitHub icon. */
function iconProfile(l, text, basics, found) {
  const t = text.trim();
  if (l.icon && NETWORKS[l.icon] && /^@?[\w][\w.-]{1,60}$/.test(t)) { addProfile(l.icon, t, basics, found); return true; }
  return false;
}

function pullContacts(text, basics, found) {
  let rest = text;
  const take = (re, fn) => { const m = rest.match(re); if (m) { fn(m[0]); rest = rest.replace(m[0], ' '); return true; } return false; };
  for (let guard = 0; guard < 6; guard++) {
    let hit = false;
    // Before e-mail addresses, so a Mastodon handle isn't read as one.
    hit = take(HANDLE, (v) => { const m = v.match(HANDLE); addProfile(m[1], m[2], basics, found); }) || hit;
    hit = take(EMAIL, (v) => { if (!basics.email) { basics.email = v; found.add('email'); } }) || hit;
    for (const [network, re] of PROFILE_SITES) {
      hit = take(re, (v) => {
        const url = /^https?:/.test(v) ? v : 'https://' + v.replace(/^www\./, '');
        if (!basics.profiles.some((p) => p.url === url)) basics.profiles.push({ network, username: v.split('/').filter(Boolean).pop().replace(/^@/, ''), url: network === 'Mastodon' ? '' : url });
        found.add(network);
      }) || hit;
    }
    hit = take(/(?:https?:\/\/|www\.)\S+/i, (v) => { if (!basics.url) basics.url = /^https?:/.test(v) ? v : 'https://' + v; }) || hit;
    hit = take(PHONE, (v) => { if (!basics.phone && v.replace(/\D/g, '').length >= 9) { basics.phone = v.trim(); found.add('phone'); } }) || hit;
    if (!hit) break;
  }
  const m = rest.match(URL_RE);
  if (m && !basics.url && !/@/.test(m[0])) { basics.url = /^https?:/.test(m[1]) ? m[1] : 'https://' + m[1]; rest = rest.replace(m[0], ' '); }
  return rest.replace(/<\s*>/g, ' ').replace(/\b(e-?mail|email|tel|telephone|phone|mobile|mob|t|m|e|w|web|website|linkedin|github|address)\s*[:.]\s*/gi, ' ');
}

function setLocation(basics, text) {
  const t = text.replace(/^(address|location|based in)\s*[:.]?\s*/i, '');
  let parts = t.split(/\s*,\s*/);
  // "Coventry England", with no comma.
  const tail = parts.length === 1 && t.match(/^(.+?)\s+(england|scotland|wales|northern ireland|ireland|uk|united kingdom|usa|united states|canada|australia|germany|france|spain|netherlands|india)$/i);
  if (tail) parts = [tail[1], tail[2]];
  // "12 Example Road, Nottingham NG1 1AA": the street goes in the address.
  if (parts.length > 1 && /^\d+[a-z]?\s|^(flat|apartment|unit)\b/i.test(parts[0])) basics.location.address = parts.shift();
  const pc = t.match(UK_POSTCODE);
  basics.location.city = parts[0].replace(UK_POSTCODE, '').trim() || parts[0];
  basics.location.region = parts.length > 1 ? parts.slice(1).join(', ').replace(UK_POSTCODE, '').replace(/^,|,$/g, '').trim() : '';
  if (pc) basics.location.postalCode = pc[0];
}

function looksLikeName(t) {
  const w = words(t);
  if (w.length < 1 || w.length > 5) return false;
  if (/[\d@/:]/.test(t) || headingSection(t)) return false;
  if (TITLE_WORDS.test(t) && w.length > 2) return false;
  return w.every((x) => /^[A-ZÀ-ÖØ-Þ][\p{L}'’.-]*$/u.test(x) || /^(van|von|de|da|del|der|la|le|bin|al|du|di|mc|mac)$/i.test(x)) || (t === t.toUpperCase() && w.length >= 2 && w.length <= 4);
}

function titleCaseName(t) {
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\bMc(\p{L})/gu, (m, a) => 'Mc' + a.toUpperCase()) : t;
}

const DETAIL = /^([A-Z][\w '’/-]{1,28}?)\s*:\s*(\S.*)$/;

/** Name and contact details from the top of the CV; returns other "Label: value" details (nationality…). */
function readHeader(lines, basics, found, body) {
  // "Name: Morgan Lee", the old personal-details way.
  lines = lines.map((l) => (/^(full\s+)?name\s*:/i.test(l.text) ? { ...l, text: l.text.replace(/^(full\s+)?name\s*:\s*/i, '') } : l));
  // Name: the biggest line near the top, else the first name-like line.
  const top = lines.slice(0, 8);
  let nameLine = null;
  const sized = top.filter((l) => l.size > 0);
  if (sized.length) {
    const biggest = sized.reduce((a, b) => (b.size > a.size ? b : a));
    if (biggest.size > body * 1.2 && looksLikeName(biggest.text.replace(/,.*$/, ''))) nameLine = biggest;
  }
  if (!nameLine) nameLine = top.find((l) => looksLikeName(l.text) && !EMAIL.test(l.text));
  // A name set large enough to wrap ("Alex" / "Morgan").
  if (nameLine) {
    const i = lines.indexOf(nameLine), next = lines[i + 1];
    if (next && nameLine.size && Math.abs(next.size - nameLine.size) < 0.6 && looksLikeName(next.text) && words(nameLine.text + ' ' + next.text).length <= 4) {
      nameLine = { ...nameLine, text: nameLine.text + ' ' + next.text };
      lines = lines.slice(0, i).concat([nameLine], lines.slice(i + 2));
    }
  }
  if (!nameLine) nameLine = top.find((l) => !EMAIL.test(l.text) && !PHONE.test(l.text) && words(l.text).length <= 5 && !/\d/.test(l.text));
  const leftovers = [], details = [];
  for (const l of lines) {
    if (l === nameLine) {
      // "Jo Bloggs, Data Engineer" or "Jo Bloggs | Data Engineer"
      const [n, ...more] = l.text.split(/\s*[|,–—]\s*/);
      basics.name = titleCaseName(n.trim());
      found.add('name');
      if (more.length && !EMAIL.test(more.join(' '))) basics.label = more.join(', ');
      continue;
    }
    if (iconProfile(l, l.text, basics, found)) continue;
    const kv = l.text.match(DETAIL);
    if (kv && /^(address|location|home|based in|town|city)$/i.test(kv[1].trim())) { setLocation(basics, kv[2]); found.add('location'); continue; }
    const rest = pullContacts(l.text, basics, found);
    // "Driving licence: Full, clean" and the like stay together, as details.
    if (kv && rest.trim() === l.text.trim()) { details.push(l.text.trim()); continue; }
    const split = rest.split(/\s*[|•·▪◦●/]\s*|\s{2,}|\t/).map((x) => x.replace(/^[\s,;–—-]+|[\s,;–—-]+$/g, '')).filter((x) => x.length > 1);
    // "Platform Engineer | DevOps Practitioner": a line of words with no contact details in it stays whole.
    if (split.length > 1 && rest.trim() === l.text.trim() && l !== nameLine && words(rest).length <= 12 && !split.some((x) => PLACES.test(x) || UK_POSTCODE.test(x) || /\d/.test(x))) { leftovers.push({ text: rest.trim(), line: l }); continue; }
    for (const piece of rest.split(/\s*[|•·▪◦●/]\s*|\s{2,}|\t/)) {
      const p = piece.replace(/^[\s,;–—-]+|[\s,;–—-]+$/g, '');
      if (p.length > 1) leftovers.push({ text: p, line: l });
    }
  }
  // A running header often repeats the name.
  for (let k = leftovers.length - 1; k >= 0; k--) if (basics.name && norm(leftovers[k].text) === norm(basics.name)) leftovers.splice(k, 1);
  // Location: something place-like among the leftovers.
  let locIdx = leftovers.findIndex((x) => x.line.icon === 'location' && words(x.text).length <= 8);
  if (locIdx < 0) locIdx = leftovers.findIndex((x) => (PLACES.test(x.text) || UK_POSTCODE.test(x.text)) && words(x.text).length <= 7 && !TITLE_WORDS.test(x.text));
  // Else a short name sitting among the contact details ("jo@example.com · 07700 900333 · Derby").
  if (locIdx < 0) locIdx = leftovers.findIndex((x) => x.line !== nameLine && x.line.text !== x.text && (EMAIL.test(x.line.text) || PHONE.test(x.line.text)) && words(x.text).length <= 3 && /^[A-Z][\p{L}'’.-]*(\s+[A-Z][\p{L}'’.-]*)*$/u.test(x.text) && !TITLE_WORDS.test(x.text));
  if (locIdx >= 0) {
    setLocation(basics, leftovers[locIdx].text);
    leftovers.splice(locIdx, 1);
    found.add('location');
  }
  // Label: the first remaining short line under the name.
  const label = leftovers.find((x) => words(x.text).length <= 10 && !/[.]$/.test(x.text) && x.line !== nameLine);
  if (!basics.label && label && (!nameLine || !(label.line.size > nameLine.size))) { basics.label = label.text; leftovers.splice(leftovers.indexOf(label), 1); }
  // Anything long left in the header is probably a summary that had no heading.
  const para = leftovers.filter((x) => words(x.text).length > 10).map((x) => x.text);
  if (para.length && !basics.summary) basics.summary = para.join(' ');
  return details;
}

/** A line that's only contact details: an icon, an address, a handle, a short place name. */
function contactLine(l) {
  const t = l.text.trim();
  if (words(t).length > 8 || /[.!?]$/.test(t)) return false;
  if (l.icon) return true;
  if (EMAIL.test(t) || HANDLE.test(t) || PROFILE_SITES.some(([, re]) => re.test(t))) return true;
  if (PHONE.test(t) && t.replace(/[\d\s()+.-]/g, '').length < 12) return true;
  if (URL_RE.test(t) && words(t).length <= 2) return true;
  return words(t).length <= 3 && (PLACES.test(t) || UK_POSTCODE.test(t)) && !TITLE_WORDS.test(t);
}

/** Contact-detail lines into basics; returns the lines that said something else (nationality, licence…). */
function personal(lines, basics, found) {
  const rest = [];
  for (const l of lines) {
    if (iconProfile(l, l.text, basics, found)) continue;
    const left = pullContacts(l.text, basics, found).replace(/^[\s,;|·•–—-]+|[\s,;|·•–—-]+$/g, '').trim();
    if (left.length > 2) rest.push({ ...l, text: left });
  }
  const loc = rest.find((l) => l.icon === 'location') || rest.find((l) => PLACES.test(l.text) || UK_POSTCODE.test(l.text));
  if (loc && !basics.location.city) { setLocation(basics, loc.text); found.add('location'); rest.splice(rest.indexOf(loc), 1); }
  // Only keep what's left if it says something (not a fragment of a wrapped address).
  return rest.filter((l) => words(l.text).length > 1 || /:/.test(l.text));
}

function wrappedHeading(before, l, t) {
  const b = before.text.trim();
  if (words(b).length > 4 || /[.,;:]$/.test(b) || /\d|@/.test(b) || findRange(b) || before.bullet || headingSection(b)) return false;
  if (before.size && l.size && Math.abs(before.size - l.size) > 0.3) return false;
  if (before.x != null && l.x != null && Math.abs(before.x - l.x) > 3) return false;
  if (!!before.bold !== !!l.bold) return false;
  return !!headingSection(b + ' ' + t, true) || (headingSection(t) === 'languages' && /program|script|cod(e|ing)|computer|technical|software|development/i.test(b));
}

const SPOKEN = /\b(english|french|spanish|german|italian|portuguese|dutch|polish|russian|ukrainian|mandarin|chinese|cantonese|japanese|korean|arabic|hindi|urdu|punjabi|bengali|gujarati|tamil|telugu|turkish|greek|swedish|norwegian|danish|finnish|icelandic|welsh|irish|gaelic|hebrew|persian|farsi|swahili|vietnamese|thai|indonesian|malay|tagalog|filipino|romanian|hungarian|czech|slovak|bulgarian|serbian|croatian|slovenian|lithuanian|latvian|estonian|catalan|basque|bsl|asl|sign language|latin|afrikaans|zulu|yoruba|igbo|somali|amharic|nepali|sinhala)\b|\b(native|fluent|bilingual|conversational|mother tongue|basic|intermediate|proficient|beginner|working knowledge|[abc][12])\b/i;
const CODE = /^(javascript|typescript|java|python|scala|go|golang|ruby|php|bash|shell|powershell|c|c#|c\+\+|objective-c|kotlin|swift|rust|sql|t-sql|pl\/sql|html|css|sass|node(\.?js)?|perl|r|matlab|haskell|elixir|erlang|clojure|f#|dart|lua|groovy|vba|cobol|fortran|assembly|solidity|julia|ocaml|zig|apex|abap|delphi|pascal|visual basic|vb\.net|\.net)\b/i;

/** Is a "Languages" section about programming languages? */
function codeLanguages(lines) {
  const items = lines.flatMap((l) => splitList(l.text));
  if (items.some((x) => SPOKEN.test(x))) return false;
  const n = items.filter((x) => CODE.test(x.trim())).length;
  return n >= 3 || n >= Math.max(1, items.length * 0.3);
}

/* ---------- entries ---------- */

/** Join wrapped lines back into the bullet or paragraph they belong to. */
function joinWrapped(lines) {
  const out = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    // Word paragraphs are whole already; only a manual line break inside one carries on.
    if (prev && l.para && prev.para && !l.brk) { out.push({ ...l }); continue; }
    if (prev && l.cont) { prev.text = prev.text.endsWith('-') && /^[a-z]/.test(l.text) ? prev.text.slice(0, -1) + l.text : prev.text + (prev.text.endsWith('-') ? '' : ' ') + l.text; continue; }
    const cont = prev && !l.bullet && !l.headerish && !findRange(l.text)
      && (prev.bullet ? (l.x == null || prev.x == null || l.x > prev.x - 2) : true)
      && (/^[a-z(&,]/.test(l.text) || /\w-$/.test(prev.text) || (prev.bullet && l.x != null && prev.x != null && l.x > prev.x + 3 && !l.bold) || (prev.text.length > 60 && !/[.!?:]$/.test(prev.text) && !l.bold && !(l.size > prev.size)))
      && !(l.bold && !prev.bold)
      && !(prev.headerish && !/^[a-z(&,]/.test(l.text) && !/\w-$/.test(prev.text)); // a heading isn't a paragraph that wrapped
    // "Micro-" / "Services" stays hyphenated; "devel-" / "opment" is one word again.
    if (cont) { prev.text = prev.text.endsWith('-') ? (/^[A-Z]/.test(l.text) ? prev.text + l.text : prev.text.slice(0, -1) + l.text) : prev.text + ' ' + l.text; continue; }
    out.push({ ...l });
  }
  return out;
}

/** Is this line the start of a new entry (a job, a qualification…)? */
function headerish(l, i, lines, body) {
  if (l.bullet || l.cont) return false;
  const t = l.text;
  if (findRange(t) && !(/[.]$/.test(t) && words(t).length > 14)) return true;
  if (words(t).length > 14 || (/[.;]$/.test(t) && !ABBR_END.test(t))) return false;
  if (l.bold || (body && l.size > body * 1.05)) return true;
  const next = lines[i + 1];
  if (next && (isDateLine(next.text) || (findRange(next.text) && words(next.text).length < 12))) return true;
  // "Junior Developer" / "Brightside Studio" / "2018 – 2020" with nothing to mark it but the dates below.
  const after = lines[i + 2];
  if (next && after && shortLine(l) && shortLine(next) && !next.bullet && isDateLine(after.text)) return true;
  return false;
}

// "Acme Corp." ends in a full stop without being a sentence.
const ABBR_END = /\b(ltd|inc|co|corp|plc|llc|llp|bros|dept|univ|intl|assoc|jr|sr|st|u\.s|u\.k|s\.a|n\.v|b\.v|e\.v)\.$/i;
const shortLine = (l) => !l.bullet && words(l.text).length <= 6 && !(/[.;:!?]$/.test(l.text) && !ABBR_END.test(l.text));

/** Split a section's lines into entries: [{ head: [lines], body: [lines] }]. */
function entries(lines, body, kind = '') {
  const marked = lines.map((l, i) => ({ ...l, headerish: headerish(l, i, lines, body) }));
  const joined = joinWrapped(marked);
  const out = [];
  let cur = null;
  for (const l of joined) {
    if (l.headerish) {
      // "Title / Dates / Next title": the dates closed the previous heading, so this starts a new one.
      // ("Title  Dates / Employer" keeps going: the employer belongs to the same entry.)
      const last = cur && cur.head[cur.head.length - 1];
      const dated = cur && cur.head.some((x) => findRange(x.text));
      const hasText = cur && cur.head.some((x) => !isDateLine(x.text));
      const newTitle = last && isDateLine(last.text) && hasText && !isDateLine(l.text);
      // Plain lines with no heading above them ("Degree / Institution / Grade / Dates" in a file with no bold to go
      // on) are this entry's heading, not a body that belongs to nothing.
      if (cur && !cur.head.length && cur.body.length <= 4 && cur.body.every(shortLine)) { cur.head.push(...cur.body.splice(0), l); continue; }
      if (!cur || cur.body.length || (cur.head.length >= 3 && !(isDateLine(l.text) && !dated)) || (dated && findRange(l.text)) || newTitle) { cur = { head: [], body: [] }; out.push(cur); }
      cur.head.push(l);
    } else if (cur && !cur.body.length && cur.head.length === 2 && isDateLine(cur.head[1].text) && !isDateLine(cur.head[0].text) && shortLine(l)) {
      // "Title / Dates / Employer": the short line straight after the dates is still the heading.
      cur.head.push(l);
    } else if (cur && !cur.body.length && cur.head.length === 1 && findRange(cur.head[0].text) && shortLine(l) && !/,/.test(l.text) && TITLE_WORDS.test(l.text) && words(l.text).length <= 5) {
      // "Acme Ltd | 2019 – 2021" / "Co-Founder" in body text: a job title under a dated heading.
      cur.head.push(l);
    } else if (kind === 'work' && cur && !cur.body.length && cur.head.length === 1 && findRange(cur.head[0].text) && !l.bullet && words(l.text).length <= 8 && !(/[.;:!?]$/.test(l.text) && !ABBR_END.test(l.text)) && !roleParts(headDates(cur.head).rest).company && headDates(cur.head).rest.join('').trim()) {
      // "2021 – Present  Senior Engineer" / "Example Ltd, Sheffield": the heading named only the job, so the
      // short line under it is who it was for.
      cur.head.push(l);
    } else if (kind === 'education' && cur && !cur.body.length && cur.head.length === 1 && findRange(cur.head[0].text) && !l.bullet && words(l.text).length <= 8 && INSTITUTION.test(l.text) && !INSTITUTION.test(cur.head[0].text)) {
      // "2004 – 2008  MEng Civil Engineering" / "University of Sheffield"
      cur.head.push(l);
    } else {
      if (!cur) { cur = { head: [], body: [] }; out.push(cur); }
      cur.body.push(l);
    }
  }
  return out;
}

/** Pull the date range out of an entry's heading lines. */
function headDates(head) {
  for (const l of head) {
    const r = findRange(l.text);
    if (r) {
      const text = (l.text.slice(0, r.index) + ' ' + l.text.slice(r.index + r.match.length)).replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/,\s*(?=,)/g, '').replace(/^[\s|,·•–—-]+|[\s|,·•–—-]+$/g, '').replace(/\s{2,}/g, ' ');
      return { start: r.start || '', end: r.single ? '' : r.end, single: !!r.single, rest: head.map((h) => (h === l ? text : h.text)).filter(Boolean) };
    }
  }
  return { start: '', end: '', rest: head.map((h) => h.text) };
}

const SPLIT = /\s+(?:\||•|·|—|–|-)\s+|\s*\|\s*|\t|,\s+(?=[A-Z])|\s{3,}/;

/** Job title vs employer vs location from heading pieces. */
export function roleParts(texts) {
  const pieces = [];
  let contract = false;
  texts.forEach((t, line) => {
    // "Contract with Example Bank", "Contracting at Example Ltd": the employer, on a contract.
    const deal = t.match(/^(?:contract(?:or|ing)?|freelanc(?:e|er|ing)|interim)\s+(?:role\s+|work\s+)?(?:with|at|for)\s+(.+)$/i);
    if (deal) { contract = true; pieces.push(...deal[1].split(SPLIT).map((x, i) => ({ t: x.trim(), role: i === 0 ? 'company' : null, line }))); return; }
    const at = t.match(/^(.*?)\s+(?:at|@)\s+(.*)$/i);
    if (at && TITLE_WORDS.test(at[1])) { pieces.push({ t: at[1], role: 'title', line }, ...at[2].split(SPLIT).map((x, i) => ({ t: x, role: i === 0 ? 'company' : null, line }))); return; }
    for (const p of t.split(SPLIT)) { let c = p.trim().replace(/^[·•|]+\s*/, ''); if (/^\(.*\)$/.test(c)) c = c.slice(1, -1); if (c) pieces.push({ t: c, role: null, line, src: t }); }
  });
  // "Co-Founder Acme Ltd" over "Co-Founder": the repeated title isn't part of the employer's name.
  for (const a of pieces) for (const b of pieces) {
    if (a !== b && a.t.length >= 3 && b.t.toLowerCase().startsWith(a.t.toLowerCase() + ' ') && TITLE_WORDS.test(a.t)) b.t = b.t.slice(a.t.length + 1).trim();
  }
  for (const p of pieces) {
    if (p.role) continue;
    if (PLACES.test(p.t) && words(p.t).length <= 4 && !COMPANY_WORDS.test(p.t) && !TITLE_WORDS.test(p.t)) p.role = 'location';
  }
  // "Sample Aero plc (Bristol)", "Engineer (Remote)"
  for (const p of [...pieces]) {
    const m = p.role !== 'location' && p.t.match(/^(.+?)\s*\(([^()]+)\)$/);
    if (m && PLACES.test(m[2]) && words(m[2]).length <= 4 && !pieces.some((x) => x.role === 'location')) { p.t = m[1]; pieces.push({ t: m[2], role: 'location', line: p.line }); }
  }
  const open = () => pieces.filter((p) => !p.role);
  // Job titles end in the job ("Senior Software Engineering Consultant", "Platform Engineer (Contractor)").
  const endsInJob = (t) => TITLE_WORDS.test(t.replace(/\s*\([^)]*\)\s*$/, '').split(/\s+/).slice(-2).join(' ')) && !/\b(ltd|limited|inc|llc|plc|gmbh)\b\.?$/i.test(t);
  for (const p of open()) if (endsInJob(p.t) || (TITLE_WORDS.test(p.t) && !COMPANY_WORDS.test(p.t))) { p.role = 'title'; break; }
  for (const p of open()) if (COMPANY_WORDS.test(p.t)) { p.role = 'company'; break; }
  const left = open();
  const has = (r) => pieces.some((p) => p.role === r);
  // Default reading: the first line is the job title and the second the employer.
  if (!has('title') && left.length) left.shift().role = 'title';
  if (!has('company') && open().length) open()[0].role = 'company';
  // "Senior Platform Engineer - Golang": a short tail on the title's own line is part of the title.
  const title = pieces.find((p) => p.role === 'title');
  for (const p of open()) {
    const i = pieces.indexOf(p);
    if (title && title.src && pieces[i - 1] === title && p.line === title.line && words(p.t).length <= 3 && !COMPANY_WORDS.test(p.t) && !PLACES.test(p.t)) {
      const from = title.src.indexOf(title.t), to = title.src.indexOf(p.t, from + title.t.length);
      title.t = from >= 0 && to > from ? title.src.slice(from, to + p.t.length) : `${title.t} - ${p.t}`;
      p.role = 'joined';
    }
  }
  // A last short name left over after the title and employer is usually the town ("… – Derby").
  const left2 = open();
  if (left2.length === 1 && pieces[pieces.length - 1] === left2[0] && has('title') && has('company') && !has('location') && words(left2[0].t).length <= 3 && /^[A-Z][\p{L}'’.-]*(\s+[A-Z][\p{L}'’.-]*)*$/u.test(titleCase(left2[0].t)) && !TITLE_WORDS.test(left2[0].t) && !COMPANY_WORDS.test(left2[0].t)) left2[0].role = 'location';
  if (contract && title && !/contract|freelanc|interim/i.test(title.t)) title.t += ' (Contract)';
  for (const p of pieces) p.t = p.role === 'location' && /^[A-Z]{4,}$/.test(p.t) ? titleCase(p.t) : smartCase(p.t);
  const get = (r) => pieces.filter((p) => p.role === r).map((p) => p.t).join(', ');
  const extra = open().map((p) => p.t);
  return { title: get('title'), company: get('company'), location: get('location'), extra, sure: pieces.length <= 1 || pieces.some((p) => p.role === 'title' && TITLE_WORDS.test(p.t)) || pieces.some((p) => p.role === 'company' && COMPANY_WORDS.test(p.t)) };
}

const SUBLABEL = /^(?:(?:my|our|main|key|notable|selected)\s+)?(?:achievements|accomplishments|responsibilities|duties|contributions|highlights|impact|results|key results|outcomes|technologies(?: used)?|tech(?:nology)? stack|tools(?: used)?|skills used|environment|projects|role|work)(?:\s+(?:included|include|were|are))?\s*:?$/i;

function bodyParts(lines) {
  const highlights = [], para = [];
  for (const l of lines) if (!SUBLABEL.test(l.text.trim())) (l.bullet ? highlights : para).push(l.text);
  // A body made only of short lines with no bullets is probably a list too.
  if (!highlights.length && para.length > 1 && para.every((p) => words(p).length < 30)) return { summary: '', highlights: para };
  return { summary: sentences(listRuns(para)), highlights };
}

/** Runs of short lines inside a paragraph ("Golang, Terraform" / "Kubernetes" / "CI/CD") read as one list. */
function listRuns(paras) {
  const out = [];
  let run = [];
  const short = (p) => words(p).length <= 7 && !/[.!?:;]$/.test(p) && !/^(and|or|but|with|to|of|in|for)\b/i.test(p);
  const end = () => { if (run.length >= 2) out.push(run.join(', ')); else out.push(...run); run = []; };
  for (const p of paras) { if (short(p)) run.push(p); else { end(); out.push(p); } }
  end();
  return out;
}

/** Separate paragraphs into sentences that read on from each other. */
function sentences(paras) {
  return paras.map((p, i) => (i < paras.length - 1 && !/[.!?:;]$/.test(p) ? p + '.' : p)).join(' ').replace(/\.{2,}(?!\.)/g, '.');
}

/**
 * PDFs often draw bullets as pictures, which leaves only the indent. When a section has no bullet marks at
 * all but some lines sit further in than the rest, those are bullet points: a new one starts after a full
 * stop or a short line, and the long lines before the others wrapped.
 */
function indentBullets(lines, body) {
  if (lines.some((l) => l.bullet) || !lines.some((l) => l.x != null)) return lines;
  const base = Math.min(...lines.filter((l) => l.x != null).map((l) => l.x));
  const indented = (l) => l.x != null && l.x >= base + 8 && l.x <= base + 60 && !isDateLine(l.text) && !l.bold && !(body && l.size > body * 1.05);
  const inner = lines.filter(indented);
  if (inner.length < 2 || inner.length === lines.length) return lines;
  const full = Math.max(...inner.map((l) => l.text.length));
  return lines.map((l, i) => {
    if (!indented(l)) return l;
    const prev = lines[i - 1];
    const carriesOn = prev && indented(prev) && Math.abs(prev.x - l.x) < 3 && !/[.!?;:]$/.test(prev.text) && prev.text.length >= full * 0.72;
    return carriesOn ? { ...l, cont: true } : { ...l, bullet: true };
  });
}

function parseWork(lines, body, report, kind) {
  let group = null; // "Acme Ltd, London" over several roles there, each with its own dates
  return entries(lines, body, 'work').map((e) => {
    const d = headDates(e.head);
    const parts = roleParts(d.rest);
    const undated = e.head.filter((h) => !findRange(h.text));
    if (e.head.length >= 2 && undated.length === 1 && e.head[0] === undated[0] && parts.company && parts.title) {
      const own = roleParts([undated[0].text]);
      group = !TITLE_WORDS.test(undated[0].text) || COMPANY_WORDS.test(undated[0].text) ? { company: parts.company, location: parts.location || own.location } : null;
    } else if (parts.company) group = null;
    if (group && !parts.company && e.head.length === 1 && parts.title) { parts.company = group.company; if (!parts.location) parts.location = group.location; parts.sure = true; }
    if (!parts.sure && e.head.length) report.unsure.add(kind === 'volunteer' ? 'volunteer' : 'work');
    const { summary, highlights } = bodyParts(e.body);
    const extra = parts.extra.length ? parts.extra.join(', ') : '';
    const item = { startDate: d.start, endDate: d.end, summary: [extra, summary].filter(Boolean).join(extra && summary ? '. ' : ''), highlights, location: parts.location };
    if (kind === 'volunteer') return { ...item, position: parts.title, organization: parts.company };
    return { ...item, position: parts.title, name: parts.company };
  }).filter((x) => x.position || x.name || x.highlights.length || x.summary);
}

const MODE_WORD = /^((part|full)[- ]time|distance|online|evening|sandwich|with (a )?placement|placement year|remote)/i;

function parseEducation(lines, body) {
  return entries(lines, body, 'education').flatMap((e) => {
    // "Example College, 2014 – 2016" over the qualifications taken there, one per line.
    const quals = e.body.filter((l) => !l.bullet && words(l.text).length <= 16 && DEGREE.test(l.text.replace(GRADE, '').replace(/\b(honou?rs|hons)\b/gi, '')) && !INSTITUTION.test(l.text) && !/^(grade|result|modules?|dissertation|thesis)\b/i.test(l.text));
    if (!quals.length) return [qualification(e)];
    const headHas = e.head.some((h) => DEGREE.test(headDates([h]).rest.join(' ')));
    const first = headHas ? null : quals.shift();
    const main = qualification({ head: first ? [...e.head, first] : e.head, body: e.body.filter((l) => l !== first && !quals.includes(l)) });
    return [main, ...quals.map((q) => ({ ...qualification({ head: [q], body: [] }), institution: main.institution, location: main.location, startDate: main.startDate, endDate: main.endDate }))];
  }).filter((x) => x.institution || x.studyType);
}

function qualification(e) {
  {
    const d = headDates(e.head);
    const item = { institution: '', studyType: '', area: '', score: '', location: '', startDate: d.start, endDate: d.single ? d.start : d.end, courses: [], summary: '' };
    if (d.single) item.startDate = '';
    const lines = [];
    for (let t of d.rest) {
      // "A Levels: Maths, Physics, Chemistry (A*AA)" keeps its list of subjects together.
      const m = t.match(/^([^:]{2,40}):\s*(.+)$/);
      if (m && DEGREE.test(m[1]) && !item.studyType) {
        let area = m[2];
        const g = area.match(/\(([A-E*]{1,8}|[^)]*\b(?:grades?|gpa|distinction|merit|first)\b[^)]*)\)\s*$/i);
        if (g) { item.score = g[1]; area = area.replace(g[0], '').trim(); }
        item.studyType = m[1].trim(); item.area = area;
        continue;
      }
      lines.push(t);
    }
    const rest = [];
    // "(Part-time)", "(Distance learning)": how it was studied, not what.
    const MODE = /\s*\(((?:part|full)[- ]time|distance(?: learning)?|online|evening(?: study)?|sandwich|with (?:a )?placement(?: year)?|placement year|remote)\)/gi;
    const pieces = lines.map((t) => t.replace(MODE, (m, mode) => { rest.push(mode.charAt(0).toUpperCase() + mode.slice(1)); return ' '; }).replace(/\s{2,}/g, ' '))
      .flatMap((t) => t.split(/\s*[|•·–—]\s*|,\s+(?=[A-Z])|\t/)).map((x) => x.trim()).filter(Boolean);
    for (let p of pieces) {
      const g = p.match(GRADE);
      if (g && !INSTITUTION.test(p)) {
        if (!item.score) item.score = g[0].replace(/^grade[:\s]+/i, '');
        p = p.replace(g[0], '').replace(/[\s(),:-]+$|^[\s(),:-]+/g, '').replace(/\(\s*\)/, '').trim();
        if (!p || /^(honours|hons|with)$/i.test(p)) continue;
      }
      if (!item.institution && INSTITUTION.test(p)) { item.institution = p; continue; }
      if (!item.studyType && DEGREE.test(p)) {
        const m = p.match(/^(.*?)\s+(?:in|of)\s+(.+)$/i);
        const named = p.match(/^((?:Bachelor|Master|Doctor)(?:'?s)?\s+of\s+(?:Arts|Science|Engineering|Laws|Philosophy|Education|Music|Business Administration|Fine Arts|Technology|Nursing|Medicine|Surgery)(?:\s*\([^)]*\))?)(?:\s*(?:in|of|,|-|–)\s*|\s+)(.+)$/i);
        if (named) { item.studyType = named[1]; item.area = named[2]; continue; }
        const lead = p.match(/^((?:[BM]\.?(?:Sc|A|Eng|Ed|Mus|Arch|Phil|Res)|[BM]\.S|Ph\.?D|MBA|LL[BM]|PGCE|HN[DC]|BTEC|MSci|MChem|MPhys|MMath|BS|MS|BFA|MFA)\.?(?:\s*\((?:Hons|Honours)\))?)\s+(.+)$/i);
        if (m && DEGREE.test(m[1])) { item.studyType = m[1]; item.area = m[2]; } else if (lead) { item.studyType = lead[1]; item.area = lead[2]; } else item.studyType = p;
        continue;
      }
      if (PLACES.test(p) && words(p).length <= 3) { item.location = p; continue; }
      rest.push(p);
    }
    const modes = rest.splice(0, rest.findIndex((x) => !MODE_WORD.test(x)) < 0 ? rest.length : rest.findIndex((x) => !MODE_WORD.test(x)));
    if (!item.institution && rest.length) item.institution = rest.shift();
    if (!item.area && rest.length) item.area = rest.shift();
    rest.unshift(...modes);
    const { summary, highlights } = bodyParts(e.body);
    // Grades often sit in the body ("Grade: 2:1").
    let text = summary;
    if (!item.score) {
      const g = [summary, ...highlights].join(' ').match(GRADE);
      if (g) { item.score = g[0].replace(/^grade[:\s]+/i, ''); text = text.replace(g[0], '').replace(/^[\s,.:;-]+|[\s,:;-]+$/g, '').replace(/^grade\s*$/i, ''); }
    }
    item.courses = highlights;
    item.summary = [rest.join(', '), text].filter(Boolean).join('. ');
    return item;
  }
}

function splitList(text) {
  return text.split(/\s*[,;|•·▪]\s*|\s{2,}|\t/).map((x) => x.replace(/^and\s+/i, '').replace(/[.;]+$/, '').trim()).filter((x) => x && x.length < 60);
}

export function parseSkills(lines, lead = '') {
  const groups = [], loose = [];
  // A group under a heading line ("Programming Languages" then its list). A list that starts before any
  // group heading belongs to the section's own title when that names a group ("Programming Languages").
  let cur = lead ? { name: lead, parts: [] } : null;
  const flush = () => { if (cur) { const keywords = splitList(cur.parts.join(cur.oneEach ? ', ' : ' ')); if (keywords.length) groups.push({ name: cur.name, keywords }); cur = null; } };
  lines.forEach((l, i) => {
    const t = l.text.trim();
    const next = lines[i + 1];
    const m = t.match(/^([^:]{2,40}):\s*(.+)$/);
    if (m) { flush(); groups.push({ name: m[1].trim(), keywords: splitList(m[2]) }); return; }
    const bigger = l.size && next && next.size && l.size > next.size * 1.08 && !(next.size > l.size);
    const headingLike = !/[,;|•·]/.test(t) && words(t).length <= 5 && !/[.]$/.test(t) && !l.bullet && (l.bold || bigger || (next && /,/.test(next.text) && !next.bold));
    if (headingLike && next && (l.bold || bigger || !cur)) { flush(); cur = { name: t, parts: [] }; return; }
    if (cur) {
      // One skill per line ("Docker" / "Kubernetes") or a wrapped comma list ("…, Amazon" / "SES, …").
      const prev = cur.parts[cur.parts.length - 1];
      if (prev != null && /^[(&]/.test(t)) { cur.parts[cur.parts.length - 1] = prev + ' ' + t; return; }
      if (!cur.parts.length) cur.oneEach = !/[,;|•·]/.test(t) && words(t).length <= 5;
      else if (/[,;|•·]/.test(t)) cur.oneEach = false;
      cur.parts.push(t);
      return;
    }
    const items = splitList(t);
    if (items.length === 1 && words(items[0]).length > 6) loose.push(t); // a sentence about skills
    else if (loose.length && /^[(&]/.test(t)) loose[loose.length - 1] += ' ' + t;
    else loose.push(...items);
  });
  flush();
  if (loose.length) groups.push({ name: groups.length ? 'Other' : lead || 'Skills', keywords: loose });
  return groups.filter((g) => g.keywords.length);
}

function parseLanguages(lines) {
  const out = [];
  for (const piece of lines.flatMap((l) => (l.text.match(/[,;|]/) ? l.text.split(/\s*[,;|]\s*/) : [l.text]))) {
    const m = piece.match(/^([\p{L} ]+?)\s*(?:[(:–—-]\s*|\s+-\s+)(.+?)\)?$/u);
    if (m) out.push({ language: m[1].trim(), fluency: m[2].trim() });
    else if (piece.trim()) out.push({ language: piece.trim(), fluency: '' });
  }
  return out;
}

/** One-line entries: certificates, awards, publications. */
function parseSimple(lines, kind) {
  const items = [];
  for (const e of entries(lines, 0)) {
    const all = [...e.head, ...e.body];
    if (e.head.length) {
      const d = headDates(e.head);
      const more = joinWrapped(e.body).map((b) => b.text);
      // "Title" / "Publisher" / "What it's about": the short line under the title says who.
      const by = more.length && words(more[0]).length <= 6 && !/[.!?]$/.test(more[0]) && !e.body[0].bullet ? more.shift() : '';
      items.push({ text: d.rest.join(', '), date: d.start, more, by });
    }
    if (!e.head.length) for (const l of all) { const r = findRange(l.text); items.push({ text: r ? l.text.replace(r.match, '').replace(/[\s(),–—-]+$/, '') : l.text, date: r ? (r.single ? r.start : r.end || r.start) : '', more: [], by: '' }); }
  }
  return items.filter((x) => x.text).map(({ text, date, more, by }) => {
    let first, second = '';
    const paren = text.match(/^(.*\S)\s*\(([^()]{2,60})\)\s*$/);
    if (paren && !/\d{4}/.test(paren[2])) { first = paren[1]; second = paren[2]; }
    else if (kind === 'publications') first = text; // titles have colons and dashes of their own
    else { const parts = text.split(/\s+[–—|]\s+|\s+-\s+|,\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean); first = parts[0]; second = parts.slice(1).join(', '); }
    if (by && !second) second = by; else if (by) more = [by, ...more];
    if (kind === 'certificates') return { name: first, issuer: second, date: date || '', url: '' };
    if (kind === 'awards') return { title: first, awarder: second, date: date || '', summary: more.join(' ') };
    return { name: first, publisher: second, releaseDate: date || '', summary: more.join(' '), url: '' };
  });
}

function parseCustom(lines, body) {
  return entries(lines, body).map((e) => {
    const d = headDates(e.head);
    const { summary, highlights } = bodyParts(e.body);
    return { title: d.rest[0] || '', subtitle: d.rest.slice(1).join(', '), location: '', startDate: d.start, endDate: d.single ? '' : d.end, url: '', summary, highlights };
  }).filter((x) => x.title || x.summary || x.highlights.length);
}

/* ---------- columns inside a section ---------- */

/**
 * PDFs often set lists (skills, publications) in two or three columns, which come out as lines that run
 * across all of them. When most lines of a section have wide gaps at the same places, read it a column
 * at a time instead.
 */
export function regroupColumns(lines) {
  const withSegs = lines.filter((l) => l.segments && l.segments.length);
  const multi = withSegs.filter((l) => l.segments.length >= 2);
  if (multi.length < 2 || multi.length < lines.length * 0.3) return lines;
  const xs = withSegs.flatMap((l) => l.segments.map((s) => s.x)).sort((a, b) => a - b);
  const clusters = [];
  for (const x of xs) { const c = clusters[clusters.length - 1]; if (c && x - c.max < 14) { c.max = x; c.n++; } else clusters.push({ min: x, max: x, n: 1 }); }
  const cols = clusters.filter((c) => c.n >= 2).map((c) => c.min);
  if (cols.length < 2) return lines;
  // Right-hand dates are a heading layout, not columns.
  const right = multi.map((l) => l.segments[l.segments.length - 1].text);
  if (right.filter((t) => isDateLine(t)).length > right.length / 2) return lines;
  const out = cols.map(() => []);
  const colOf = (x) => { let k = 0; for (let i = 0; i < cols.length; i++) if (x >= cols[i] - 8) k = i; return k; };
  for (const l of lines) {
    const segs = l.segments && l.segments.length ? l.segments : [{ text: l.text, x: l.x ?? cols[0], bold: l.bold }];
    for (const s of segs) {
      let text = s.text, bullet = false;
      const b = text.match(BULLET);
      if (b && text.length > b[0].length + 1) { bullet = true; text = text.slice(b[0].length).trim(); }
      out[colOf(s.x)].push({ ...l, text, bold: s.bold, x: s.x, bullet: bullet || (segs.length === 1 && l.bullet), segments: null });
    }
  }
  return out.flat();
}

/* ---------- the whole thing ---------- */

/**
 * Lines -> { resume, custom, report }. `report` lists what was found and what to check.
 * lines: [{ text, size?, bold?, x?, bullet?, heading? }]
 */
export function parseCv(rawLines) {
  const lines = prepareLines(rawLines);
  const body = bodySize(lines);
  const report = { found: new Set(), unsure: new Set(), sections: [] };
  const resume = normalizeResume({});
  const basics = resume.basics;
  const custom = [];

  // Split into blocks by heading.
  const blocks = [{ id: '_header', title: '', lines: [] }];
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    const nameWrap = blocks.length === 1 && i < 4 && prev && l.size && Math.abs(l.size - prev.size) < 0.6 && looksLikeName(l.text) && looksLikeName(prev.text) && !headingSection(l.text);
    const inHeader = nameWrap || (blocks.length === 1 && i < 5 && !headingSection(l.text.replace(/[:|]+$/, '')));
    // "Key achievements:" inside a job introduces its bullets; it isn't the Achievements section.
    const within = ['work', 'volunteer', 'projects', 'education'].includes(blocks[blocks.length - 1].id) && SUBLABEL.test(l.text.trim()) && !l.heading && !(l.size > body * 1.12) && !(l.text === l.text.toUpperCase() && /[A-Z]{3}/.test(l.text));
    if (within) blocks[blocks.length - 1].lines.push(l);
    else if (i > 0 && !nameWrap && !(inHeader && (l.heading || !(l.size > body * 1.3) || (looksLikeName(l.text) && !headingSection(l.text)))) && isHeadingLine(l, body)) {
      const t = l.text.replace(/[:|]+$/, '').trim();
      let title = t;
      // A heading that wrapped: "Programming / Scripting" over "Languages".
      const cur = blocks[blocks.length - 1], before = cur.lines[cur.lines.length - 1];
      if (before && before === prev && wrappedHeading(before, l, t)) { cur.lines.pop(); title = before.text.trim() + ' ' + t; }
      let id = headingSection(title) || headingSection(t) || 'custom';
      if (id === 'languages' && title !== t) id = 'skills';
      blocks.push({ id, title, lines: [] });
      // "Skills: Python, SQL" on one line: keep what follows the colon.
    } else if (i > 0 && /^([A-Za-z &]{3,30}):\s*(.+)$/.test(l.text) && headingSection(l.text.split(':')[0]) && !['skills'].includes(blocks[blocks.length - 1].id)) {
      const [h, ...rest] = l.text.split(':');
      blocks.push({ id: headingSection(h), title: h.trim(), lines: [{ ...l, text: rest.join(':').trim() }] });
    } else blocks[blocks.length - 1].lines.push(l);
  });

  // No headings at all: the jobs and courses start at the first dated entry after the contact details.
  if (blocks.length === 1 && lines.length > 6) {
    const all = blocks[0].lines;
    const start = all.findIndex((l, i) => i >= 2 && !EMAIL.test(l.text) && !PHONE.test(l.text) && (findRange(l.text) || (all[i + 1] && isDateLine(all[i + 1].text)) || (all[i + 2] && shortLine(l) && shortLine(all[i + 1]) && isDateLine(all[i + 2].text))));
    if (start > 0) {
      const rest = all.splice(start);
      const work = [], edu = [];
      for (const e of entries(rest, body)) {
        const head = e.head.map((h) => h.text).join(' ');
        ((INSTITUTION.test(head) || DEGREE.test(head.replace(GRADE, ''))) && !TITLE_WORDS.test(head.replace(INSTITUTION, '')) ? edu : work).push(...e.head, ...e.body);
      }
      if (work.length) blocks.push({ id: 'work', title: 'Experience', lines: work });
      if (edu.length) blocks.push({ id: 'education', title: 'Education', lines: edu });
      report.unsure.add('sections');
    }
  }
  const details = readHeader(blocks[0].lines, basics, report.found, body);
  if (details.length) custom.push({ id: uid(), title: 'Personal details', items: [{ title: '', subtitle: '', location: '', startDate: '', endDate: '', url: '', summary: '', highlights: details }] });
  for (const b of blocks.slice(1)) {
    if (!b.lines.length) continue;
    // "Languages" listing JavaScript and Python is a skills list, not French and Spanish.
    if (b.id === 'languages' && codeLanguages(b.lines)) b.id = 'skills';
    if (['skills', 'publications', 'awards', 'certificates', 'languages', 'interests', 'custom'].includes(b.id)) b.lines = regroupColumns(b.lines);
    if (['work', 'volunteer', 'projects', 'education', 'custom'].includes(b.id)) b.lines = indentBullets(b.lines, body);
    report.sections.push(b.id === 'custom' ? b.title : b.id);
    switch (b.id) {
      case 'summary': {
        // A sidebar "About" often holds the contact details rather than a summary.
        const contact = b.lines.filter((l) => contactLine(l));
        if (contact.length) { personal(contact, basics, report.found); b.lines = b.lines.filter((l) => !contact.includes(l)); }
        if (!b.lines.length) break;
        basics.summary = sentences([basics.summary, ...joinWrapped(b.lines).map((l) => l.text)].filter(Boolean));
        break;
      }
      case 'work': resume.work.push(...parseWork(b.lines, body, report, 'work')); break;
      case 'volunteer': resume.volunteer.push(...parseWork(b.lines, body, report, 'volunteer')); break;
      case 'projects': resume.projects.push(...parseCustom(b.lines, body).map((p) => {
        // "Electric go-kart – github.com/alex/go-kart": the link is the project's address.
        let url = '';
        const pick = (t) => t.replace(/\s*[–—|-]?\s*\(?((?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)+\/[^\s)]*|https?:\/\/[^\s)]+)\)?\s*$/, (m, u) => { url = url || (/^https?:/.test(u) ? u : 'https://' + u); return ''; }).trim();
        const name = pick(p.title), entity = pick(p.subtitle);
        return { name, entity, description: p.summary, highlights: p.highlights, startDate: p.startDate, endDate: p.endDate, url };
      })); break;
      case 'education': resume.education.push(...parseEducation(b.lines, body)); break;
      case 'skills': resume.skills.push(...parseSkills(b.lines, /^(key |core |technical |it |other )?skills( summary)?$|^(skills|expertise|competencies)\b/i.test(b.title) ? '' : titleCase(b.title))); break;
      case 'languages': resume.languages.push(...parseLanguages(b.lines)); break;
      case 'certificates': case 'awards': case 'publications': resume[b.id].push(...parseSimple(b.lines, b.id)); break;
      case 'interests': resume.interests.push(...b.lines.flatMap((l) => splitList(l.text)).map((name) => ({ name, keywords: [] }))); break;
      case 'references': {
        const t = b.lines.map((l) => l.text).join(' ');
        if (!/available (up)?on request/i.test(t)) resume.references.push(...entries(b.lines, body).map((e) => ({ name: e.head.map((h) => h.text).join(', ') || e.body.shift()?.text || '', reference: e.body.map((x) => x.text).join(' ') })));
        break;
      }
      case '_personal': {
        // Contact details under their own heading, plus things like nationality.
        const meaningful = personal(b.lines, basics, report.found);
        if (meaningful.length) custom.push({ id: uid(), title: b.title, items: [{ title: '', subtitle: '', location: '', startDate: '', endDate: '', url: '', summary: '', highlights: meaningful.map((l) => l.text) }] });
        break;
      }
      default: custom.push({ id: uid(), title: titleCase(b.title), items: parseCustom(b.lines, body) });
    }
  }
  for (const k of ['work', 'education', 'skills', 'projects']) if (resume[k].length) report.found.add(k);
  if (basics.summary) report.found.add('summary');
  return { resume: normalizeResume(resume), custom: custom.filter((c) => c.items.length), report: { found: [...report.found], unsure: [...report.unsure], sections: report.sections } };
}

function titleCase(t) { return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t; }

/** "SENIOR MECHANICAL ENGINEER" -> "Senior Mechanical Engineer"; short capitals ("BBC", "IT") stay as they are. */
function smartCase(t) {
  if (t !== t.toUpperCase() || !/[A-Z]{4}/.test(t) || words(t).length < 2 && t.length < 6) return t;
  const small = /^(of|and|the|for|at|in|on|to|a|an|&)$/i;
  return t.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? w : i > 0 && small.test(w) ? w.toLowerCase() : w.length <= 3 && /^[A-Z]+$/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase().replace(/([-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()))).join('');
}

/** Plain pasted text -> lines (bullets and blank-line gaps kept). */
export function textLines(text) {
  return String(text).split(/\r?\n/).map((t) => ({ text: t }));
}

export { parseDate };
