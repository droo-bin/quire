// A small CSV reader (quoted fields, embedded newlines and commas), for LinkedIn's data export.

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** CSV text to an array of objects keyed by the header row. LinkedIn sometimes puts notes above the header. */
export function csvObjects(text, mustHave) {
  const rows = parseCSV(text);
  let h = 0;
  if (mustHave) { const i = rows.findIndex((r) => r.includes(mustHave)); if (i >= 0) h = i; }
  const head = (rows[h] || []).map((x) => x.trim());
  return rows.slice(h + 1).map((r) => Object.fromEntries(head.map((k, i) => [k, (r[i] || '').trim()])));
}
