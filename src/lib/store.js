// Everything is kept in this browser (IndexedDB), never sent anywhere. Each CV is one record; earlier
// versions are kept as snapshots so a bad edit or import can be undone days later.

const DB = 'quire', VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('snapshots')) {
        const s = db.createObjectStore('snapshots', { keyPath: 'key' });
        s.createIndex('doc', 'docId');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage was interrupted.'));
  }));
}
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export async function listDocs() {
  const all = await tx('docs', 'readonly', (s) => req(s.getAll()));
  return all.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export const getDoc = (id) => tx('docs', 'readonly', (s) => req(s.get(id)));
export const putDoc = (doc) => tx('docs', 'readwrite', (s) => req(s.put(JSON.parse(JSON.stringify(doc)))));
export async function deleteDoc(id) {
  await tx('docs', 'readwrite', (s) => req(s.delete(id)));
  const snaps = await listSnapshots(id);
  await tx('snapshots', 'readwrite', (s) => Promise.all(snaps.map((x) => req(s.delete(x.key)))));
}

/** Keep a copy of a document. Kept: the last 30, at most one every ten minutes unless forced. */
export async function snapshot(doc, reason = 'edit', force = false) {
  const snaps = await listSnapshots(doc.id);
  const last = snaps[0];
  if (!force && last && Date.now() - last.at < 10 * 60 * 1000) return false;
  const key = doc.id + ':' + Date.now();
  await tx('snapshots', 'readwrite', (s) => req(s.put({ key, docId: doc.id, at: Date.now(), reason, doc: JSON.parse(JSON.stringify(doc)) })));
  if (snaps.length >= 30) await tx('snapshots', 'readwrite', (s) => Promise.all(snaps.slice(29).map((x) => req(s.delete(x.key)))));
  return true;
}
export async function listSnapshots(docId) {
  const all = await tx('snapshots', 'readonly', (s) => req(s.index('doc').getAll(docId)));
  return all.sort((a, b) => b.at - a.at);
}

export const getSetting = (k) => tx('settings', 'readonly', (s) => req(s.get(k)));
export const setSetting = (k, v) => tx('settings', 'readwrite', (s) => req(s.put(v, k)));

/** Ask the browser not to clear Quire's storage when space runs low. */
export async function persist() {
  try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* not supported */ }
}
