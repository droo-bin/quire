// The typefaces a CV can use. They're all bundled (so the CV looks the same everywhere, offline) and the
// same files are embedded in exported PDFs, so what you see is exactly what gets sent. Names start with
// "Quire" so a copy installed on the computer is never used instead.

export const FONTS = {
  instrument: { name: 'Instrument Sans', kind: 'sans', file: 'InstrumentSans' },
  work: { name: 'Work Sans', kind: 'sans', file: 'WorkSans' },
  carlito: { name: 'Carlito', note: 'like Calibri', kind: 'sans', file: 'Carlito' },
  lora: { name: 'Lora', kind: 'serif', file: 'Lora' },
  plex: { name: 'IBM Plex Serif', kind: 'serif', file: 'IBMPlexSerif' },
  caladea: { name: 'Caladea', note: 'like Cambria', kind: 'serif', file: 'Caladea' },
};

export const FACES = [['Regular', 400, 'normal'], ['Bold', 700, 'normal'], ['Italic', 400, 'italic'], ['BoldItalic', 700, 'italic']];

export const cssFamily = (id) => `"Quire ${FONTS[id].name}"`;

/** Font file URL for a family and face. */
export function fontUrl(id, face, base = new URL('../vendor/fonts/', import.meta.url)) {
  return new URL(`${FONTS[id].file}-${face}.ttf`, base).href;
}

/** Which family a CSS font-family value refers to, by our "Quire …" name. */
export function familyFromCss(value) {
  const v = String(value || '');
  return Object.keys(FONTS).find((id) => v.includes(`Quire ${FONTS[id].name}`)) || null;
}

let installed = false;
/** Add @font-face rules for every family (the browser only downloads what's used). */
export function installFonts() {
  if (installed) return;
  installed = true;
  const css = Object.keys(FONTS).flatMap((id) => FACES.map(([face, weight, style]) =>
    `@font-face{font-family:${cssFamily(id)};src:url("${fontUrl(id, face)}") format("truetype");font-weight:${weight};font-style:${style};font-display:block}`)).join('\n');
  const el = document.createElement('style');
  el.id = 'quire-fonts';
  el.textContent = css;
  document.head.append(el);
}

/** Wait until the faces a CV uses have loaded, so measuring (pages, PDF) is right. */
export async function fontsReady(id) {
  installFonts();
  await Promise.all(FACES.map(([, weight, style]) => document.fonts.load(`${style} ${weight} 12px ${cssFamily(id)}`, 'Aa')));
  await document.fonts.ready;
}
