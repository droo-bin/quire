// Matching a CV against a job advert. It picks out what the advert asks for (known skills and tools,
// qualifications, and phrases it repeats), weights things in "essential" or "you will have" sentences
// more, and checks which of them the CV mentions, allowing for synonyms and word forms. It's a guide to
// what to mention, not a score to chase: only add things that are true.

import { SKILL_TERMS, SYNONYMS, STOPWORDS, PROPER_NAMES } from './words.js';

const SYN = new Map();
for (const group of SYNONYMS) for (const w of group) SYN.set(w, group);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Loose word form: plural and -ing/-ed endings removed, British/American -ise/-ize the same. */
export function stem(w) {
  return w.toLowerCase().replace(/(is|iz)(e|ed|es|ing|ation|ations)$/, 'iz').replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '').replace(/(our)$/, 'or');
}
const termRe = (t) => new RegExp(`(^|[^\\w+#.])${esc(t)}(?=$|[^\\w+#]|\\.(\\s|$))`, 'i');

/** Phrases worth matching from an advert: [{ term, label, weight }]. */
export function extractTerms(job) {
  const text = String(job || '');
  const sentences = text.split(/(?<=[.!?\n•])\s+|\n+/);
  const important = (s) => /\b(essential|required|must|you will have|you'll have|you have|experience (of|with|in)|proven|strong|demonstrable|knowledge of|proficien|qualified|need)\b/i.test(s);
  const found = new Map();
  const bump = (term, label, w) => { const k = term.toLowerCase(); const cur = found.get(k); found.set(k, { term: k, label: cur ? cur.label : label, weight: (cur ? cur.weight : 0) + w }); };

  for (const s of sentences) {
    const boost = important(s) ? 2 : 1;
    for (const t of SKILL_TERMS) { const m = s.match(termRe(t)); if (m) bump(t, PROPER_NAMES[t] || s.substr(m.index + m[1].length, t.length), boost); }
    // Acronyms and product-like names: SAP, NHS, CIPD, Kubernetes, C#, Node.js
    for (const m of s.matchAll(/(?<![\w])([A-Z][A-Z0-9&#+/.]{1,7}|[A-Z][a-z]+[A-Z][\w]*|[A-Za-z]+\.(?:js|NET|io)|C\+\+|C#)(?![\w])/g)) {
      const w = m[1].replace(/[.]$/, '');
      if (w.length < 2 || /^(I|A|UK|US|OK|CV|HR|ID|TV|PM|AM|THE|AND|OUR|YOU|WE|IT)$/.test(w) && !/^(HR|IT)$/.test(w)) continue;
      if (/^(HR|IT)$/.test(w) && !/\b(HR|IT) (team|department|systems|support|experience|policies|policy)\b/.test(s)) continue;
      bump(w, w, boost * 0.8);
    }
  }
  // Two-word phrases the advert repeats ("data pipelines", "patient care").
  const tokens = text.toLowerCase().match(/[a-z][a-z+#.-]*/g) || [];
  const pairs = new Map();
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i], b = tokens[i + 1];
    if (STOPWORDS.has(a) || STOPWORDS.has(b) || a.length < 3 || b.length < 3) continue;
    const k = `${a} ${b}`;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  for (const [k, n] of pairs) if (n >= 2 && !found.has(k)) bump(k, k, n * 0.7);
  // Fold synonyms together, keep the best name.
  const merged = new Map();
  for (const t of found.values()) {
    const group = SYN.get(t.term);
    const key = group ? group[0] : stem(t.term);
    const cur = merged.get(key);
    if (cur) cur.weight += t.weight; else merged.set(key, { ...t, key });
  }
  return [...merged.values()].sort((a, b) => b.weight - a.weight).slice(0, 30);
}

/** Does the CV text mention a term (or a synonym, or another form of it)? */
export function mentions(cvText, term) {
  const group = SYN.get(term.term) || [term.term];
  for (const g of group) if (termRe(g).test(cvText)) return true;
  // Word forms: "analysing" for "analysis", "mentored" for "mentoring".
  const parts = term.term.split(/\s+/).map(stem);
  const words = (cvText.toLowerCase().match(/[a-z][a-z+#.-]*/g) || []).map(stem);
  if (parts.length === 1) return words.includes(parts[0]);
  for (let i = 0; i <= words.length - parts.length; i++) if (parts.every((p, k) => words[i + k] === p)) return true;
  return false;
}

/** { terms: [{label, weight, found}], score (0-100), missing: [...] } */
export function matchJob(cvText, jobText) {
  const terms = extractTerms(jobText);
  if (!terms.length) return { terms: [], score: 0, missing: [] };
  const withFound = terms.map((t) => ({ ...t, found: mentions(cvText, t) }));
  const total = withFound.reduce((n, t) => n + t.weight, 0);
  const got = withFound.filter((t) => t.found).reduce((n, t) => n + t.weight, 0);
  return { terms: withFound, score: Math.round((got / total) * 100), missing: withFound.filter((t) => !t.found) };
}
