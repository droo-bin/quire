// Just enough ZIP to read Word documents and LinkedIn exports and to write Word documents, using the
// browser's own (de)compression streams. No dependencies.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
export const inflateRaw = (b) => pipe(b, new DecompressionStream('deflate-raw'));
export const deflateRaw = (b) => pipe(b, new CompressionStream('deflate-raw'));
export const deflate = (b) => pipe(b, new CompressionStream('deflate'));

/** Read a zip: returns Map(name -> async () => Uint8Array). Throws if it isn't a zip. */
export function readZip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This file is not a zip archive.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    files.set(name, async () => {
      const lnlen = v.getUint16(local + 26, true), lxlen = v.getUint16(local + 28, true);
      const start = local + 30 + lnlen + lxlen;
      const data = b.subarray(start, start + csize);
      if (method === 0) return data.slice();
      if (method === 8) return inflateRaw(data);
      throw new Error(`Unsupported compression in ${name}.`);
    });
  }
  return files;
}

/** Write a zip from [[name, Uint8Array|string], ...] (deflated). */
export async function writeZip(entries) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, content] of entries) {
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const comp = await deflateRaw(data);
    const nm = enc.encode(name);
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 8, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
    h.setUint32(18, comp.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, comp);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 8, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, comp.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nm.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nm);
    offset += 30 + nm.length + comp.length;
  }
  const csize = central.reduce((n, x) => n + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
