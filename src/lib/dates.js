// Dates as people write them on CVs ("Sept 2019", "03/2018", "2016 – Present") and as JSON Resume stores
// them ("2019-09", "2018-03-01", "2016"). Everything is stored the JSON Resume way and shown in the format
// the person picks; an empty end date means "to the present".

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASONS = { spring: 3, summer: 6, autumn: 9, fall: 9, winter: 12 };

export const PRESENT_WORDS = /^(present|current(ly)?|now|today|ongoing|onwards?|to date|date|till date|until now|-)$/i;

/** Month number (1-12) for a month name or abbreviation, or 0. */
export function monthNumber(word) {
  const w = String(word || '').toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return 0;
  if (w === 'sept') return 9;
  const i = MONTHS.findIndex((m) => m.startsWith(w));
  return i + 1;
}

const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const SEASON_RE = '(?:spring|summer|autumn|fall|winter)';
// One date as written: "Sept 2019", "September, 2019", "09/2019", "9.2019", "2019-09", "2019", "Summer 2018", "'19".
export const DATE_RE = `(?:(?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?${MONTH_RE}(?:,?\\s+|[-/])(?:\\d{4}|'\\d{2})|${SEASON_RE}\\s+\\d{4}|\\d{1,2}[/.]\\d{4}|\\d{4}[-/.]\\d{1,2}(?:[-/.]\\d{1,2})?|\\d{1,2}[/.]\\d{1,2}[/.]\\d{4}|(?:19|20)\\d{2})`;
const END_RE = `(?:${DATE_RE}|present|current(?:ly)?|now|today|ongoing|onwards?|to date|till date)`;
// A range: "Jan 2019 – Present", "2016-2019", "03/2018 to 06/2020", "From 2019 to 2021", "Since 2020",
// "October 2022 Onwards", "2021 –" (left open).
export const RANGE_RE = new RegExp(`(?:from\\s+)?(${DATE_RE})\\s*(?:[-–—‒―~]+|to|until|till|through|thru)\\s*(${END_RE})|(?:since|from)\\s+(${DATE_RE})|(${DATE_RE})\\s*(?:onwards?\\b|\\+(?!\\d)|[-–—]\\s*$)`, 'i');
export const ONE_DATE_RE = new RegExp(`(${DATE_RE})`, 'i');

/** Parse one written date into "YYYY", "YYYY-MM" or "YYYY-MM-DD"; '' for "present"; null if it isn't a date. */
export function parseDate(text) {
  let s = String(text == null ? '' : text).trim().replace(/[,]/g, ' ').replace(/\s+/g, ' ');
  if (!s) return null;
  if (PRESENT_WORDS.test(s)) return '';
  s = s.replace(/^([A-Za-z]{3,9}\.?)[-/](\d{4}|'\d{2})$/, '$1 $2'); // "Jan-2020"
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:T.*)?$/))) return iso(+m[1], +m[2], m[3] && +m[3]);
  if ((m = s.match(/^(\d{4})[/.](\d{1,2})(?:[/.](\d{1,2}))?$/))) return iso(+m[1], +m[2], m[3] && +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.](\d{4})$/))) return iso(+m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) {
    // Day first unless that's impossible (UK default; 12/25/2020 is clearly US).
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return iso(+m[3], mo, d);
  }
  if ((m = s.match(/^(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?([a-z]+)\.?\s+(\d{4}|'\d{2})$/i))) {
    const mo = monthNumber(m[2]);
    const y = m[3].startsWith("'") ? 2000 + +m[3].slice(1) : +m[3];
    if (mo) return iso(y, mo, m[1] && +m[1]);
    const season = SEASONS[m[2].toLowerCase()];
    if (season) return iso(y, season);
  }
  if ((m = s.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/i)) && monthNumber(m[1])) return iso(+m[3], monthNumber(m[1]), +m[2]);
  if ((m = s.match(/^(19|20)\d{2}$/))) return s;
  return null;
}

function iso(y, mo, d) {
  if (!y || y < 1900 || y > 2100) return null;
  if (!mo) return String(y);
  if (mo < 1 || mo > 12) return null;
  const mm = String(mo).padStart(2, '0');
  if (!d) return `${y}-${mm}`;
  if (d < 1 || d > 31) return `${y}-${mm}`;
  return `${y}-${mm}-${String(d).padStart(2, '0')}`;
}

/** Find a date range in some text: { start, end, match, index } (end '' means present), or null. */
export function findRange(text) {
  const s = String(text || '');
  const m = s.match(RANGE_RE);
  if (m) {
    if (m[3] || m[4]) return { start: parseDate(m[3] || m[4]), end: '', match: m[0], index: m.index };
    const start = parseDate(m[1]);
    const end = parseDate(m[2]);
    if (start != null && end != null) return { start, end, match: m[0], index: m.index };
  }
  const one = s.match(ONE_DATE_RE);
  if (one) {
    const d = parseDate(one[1]);
    if (d) return { start: d, end: d, single: true, match: one[0], index: one.index };
  }
  return null;
}

/** Is this line mostly just a date or date range (so it can be lifted out of a heading)? */
export function isDateLine(text) {
  const s = String(text || '').trim();
  const r = findRange(s);
  return !!r && s.replace(r.match, '').replace(/[\s|,()•·–—-]/g, '').length < 3;
}

/** Comparable number for sorting: 2019-09 -> 2019.75. Empty (present) sorts as the future. */
export function dateValue(d, present = 9999) {
  if (d === '' || d == null) return present;
  const [y, m = 6, day = 15] = String(d).split('-').map(Number);
  return y + (m - 1) / 12 + (day - 1) / 372;
}

export const FORMATS = {
  'mon-yyyy': { label: 'Sep 2019', show: (y, m) => (m ? `${SHORT[m - 1]} ${y}` : `${y}`) },
  'month-yyyy': { label: 'September 2019', show: (y, m) => (m ? `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}` : `${y}`) },
  'mm-yyyy': { label: '09/2019', show: (y, m) => (m ? `${String(m).padStart(2, '0')}/${y}` : `${y}`) },
  'yyyy': { label: '2019', show: (y) => `${y}` },
};

/** Show a stored date in a chosen format; '' end dates read as the "present" word. */
export function formatDate(d, format = 'mon-yyyy', presentWord = 'Present') {
  if (d === '' || d == null) return presentWord;
  const [y, m] = String(d).split('-').map(Number);
  if (!y) return String(d);
  return (FORMATS[format] || FORMATS['mon-yyyy']).show(y, m);
}

/** "Sep 2019 – Present", "2016 – 2019", "Jun 2020" (no end given and none implied). */
export function formatRange(start, end, format, { presentWord = 'Present', dash = ' – ', hasEnd = true } = {}) {
  if (!start && !end) return '';
  if (!start) return formatDate(end, format, presentWord);
  const a = formatDate(start, format);
  if (!hasEnd) return a;
  const b = formatDate(end, format, presentWord);
  return a === b ? a : a + dash + b;
}

/** Whole months between two stored dates (end '' = today). */
export function monthsBetween(start, end, today = new Date()) {
  if (!start) return 0;
  const [y1, m1 = 1] = start.split('-').map(Number);
  let y2, m2;
  if (!end) { y2 = today.getFullYear(); m2 = today.getMonth() + 1; } else { [y2, m2 = 12] = end.split('-').map(Number); }
  return (y2 - y1) * 12 + (m2 - m1);
}

/** "3 yrs 2 mos" style length, for the editor. */
export function duration(start, end, today) {
  const n = monthsBetween(start, end, today) + 1;
  if (!start || n <= 0) return '';
  const y = Math.floor(n / 12), m = n % 12;
  return [y ? `${y} yr${y > 1 ? 's' : ''}` : '', m ? `${m} mo${m > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ');
}
