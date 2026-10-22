// An optional language model that runs on this device (llama.cpp compiled to WebAssembly, via wllama),
// for a second opinion on the writing. Nothing is sent anywhere: the model file downloads once from
// Hugging Face and the browser keeps it. It's slow on most computers (a minute or two for a full review)
// and it can be wrong, so every suggestion is shown for you to accept or ignore.

export const MODELS = [
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B Instruct',
    size: '1.1 GB',
    note: 'Recommended: the better writer of the two.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    licence: 'Apache 2.0',
  },
  {
    id: 'qwen2.5-0.5b',
    name: 'Qwen2.5 0.5B Instruct',
    size: '400 MB',
    note: 'Smaller and quicker, for phones and older laptops. Rougher suggestions.',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    licence: 'Apache 2.0',
  },
];

const BASE = new URL('../vendor/wllama/', import.meta.url);
let engine = null;
let loading = null;

/** For tests: any object with chat(messages, {maxTokens, onText}) -> text. */
export function useEngine(custom, name = 'custom engine') { engine = { custom, name }; }
export const loaded = () => !!engine;
export const engineName = () => engine && engine.name;

async function newWllama() {
  const { Wllama } = await import('../vendor/wllama/wllama.mjs');
  return new Wllama({
    'single-thread/wllama.wasm': new URL('single-thread/wllama.wasm', BASE).href,
    'multi-thread/wllama.wasm': new URL('multi-thread/wllama.wasm', BASE).href,
  }, { allowOffline: true, suppressNativeLog: true });
}
const LOAD = { n_ctx: 4096, n_batch: 512 };

export async function loadFromUrl(model, onProgress) {
  if (loading) return loading;
  loading = (async () => {
    const w = await newWllama();
    await w.loadModelFromUrl(model.url, { ...LOAD, progressCallback: ({ loaded: l, total }) => onProgress && onProgress(l, total) });
    engine = { wllama: w, name: model.name };
    return engine;
  })().finally(() => { loading = null; });
  return loading;
}

export async function loadFromFile(file) {
  const magic = new TextDecoder().decode(new Uint8Array(await file.slice(0, 4).arrayBuffer()));
  if (magic !== 'GGUF') throw new Error(`${file.name} isn't a GGUF model file.`);
  const named = /\.gguf$/i.test(file.name) ? file : new File([file], 'model.gguf');
  const w = await newWllama();
  await w.loadModel([named], LOAD);
  engine = { wllama: w, name: file.name.replace(/\.gguf$/i, '') };
  return engine;
}

/** Models already saved in this browser. */
export async function cachedModels() {
  try { const w = await newWllama(); const list = await w.modelManager.getModels(); return MODELS.filter((m) => list.some((x) => x.url === m.url)); } catch { return []; }
}

let stopFlag = false;
export function stop() { stopFlag = true; }

async function chat(messages, { maxTokens = 400, onText, temp = 0.3 } = {}) {
  if (!engine) throw new Error('No language model is loaded.');
  stopFlag = false;
  if (engine.custom) return engine.custom.chat(messages, { maxTokens, onText });
  const w = engine.wllama;
  const prompt = await w.formatChat(messages, true);
  const abort = new AbortController();
  const out = await w.createCompletion(prompt, {
    nPredict: maxTokens,
    sampling: { temp, top_k: 40, top_p: 0.9, penalty_repeat: 1.1 },
    abortSignal: abort.signal,
    onNewToken: (tok, piece, text) => { if (stopFlag) abort.abort(); if (onText) onText(text); },
  }).catch((e) => { if (stopFlag) return ''; throw e; });
  return out;
}

const STYLE = 'Write in plain British English. Be specific and honest. Never invent facts, numbers, employers or skills that are not in the text you are given.';

/** A stronger version of one bullet point. Returns one line. */
export async function rewriteBullet(bullet, context, onText) {
  const out = await chat([
    { role: 'system', content: `You improve bullet points on CVs. ${STYLE} Start with a strong past-tense action verb (present tense if the job is current). Keep it to one line of under 30 words. If the original has a number, keep it. If it has none, you may write [number] where a figure would help. Reply with the improved bullet only, no quotes, no explanation.` },
    { role: 'user', content: `Job: ${context}\nBullet: ${bullet}` },
  ], { maxTokens: 80, onText, temp: 0.4 });
  return cleanLine(out);
}

/** A short review of the whole CV: a few specific suggestions as a list. */
export async function reviewCv(cvText, jobText, onText) {
  const job = jobText ? `\n\nThe job they are applying for:\n${jobText.slice(0, 2500)}` : '';
  return chat([
    { role: 'system', content: `You are an experienced recruiter reviewing a CV. ${STYLE} Give the five most useful, specific suggestions to improve it, as a numbered list. Quote the part you mean. Do not rewrite the whole CV. Do not praise generically.` },
    { role: 'user', content: `CV:\n${cvText.slice(0, 6000)}${job}` },
  ], { maxTokens: 500, onText, temp: 0.3 });
}

/** A summary aimed at a job, from what the CV already says. */
export async function tailorSummary(cvText, jobText, onText) {
  const out = await chat([
    { role: 'system', content: `You write the short summary at the top of a CV. ${STYLE} Write two or three sentences (under 70 words) without "I". Draw only on the CV given, emphasising what matters for the job.` },
    { role: 'user', content: `CV:\n${cvText.slice(0, 5000)}\n\nJob:\n${jobText.slice(0, 2500)}` },
  ], { maxTokens: 160, onText, temp: 0.35 });
  return out.trim().replace(/^["“]|["”]$/g, '');
}

function cleanLine(s) {
  return String(s).trim().split('\n')[0].replace(/^[-•*\d.)\s]+/, '').replace(/^["“']|["”']$/g, '').trim();
}
