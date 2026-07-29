/**
 * Storage adapter.
 *
 * The tool components were written against the `window.storage` API, which
 * only exists inside the Claude artifact sandbox. Rather than editing nine
 * components, this provides the same shape backed by localStorage and
 * installs it on `window` — so the components port across unchanged.
 *
 * The contract matters: `get` THROWS on a missing key rather than returning
 * null, because that is what the components' try/catch blocks expect. Change
 * that and briefs silently fail to load.
 *
 * To move to a server backend later, swap the four method bodies for fetch
 * calls to /api/storage. Nothing else has to change.
 */

const PREFIX = 'lat:';

function assertBrowser() {
  if (typeof window === 'undefined') {
    throw new Error('storage is browser-only');
  }
}

export const storage = {
  async get(key) {
    assertBrowser();
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) throw new Error(`No value for "${key}"`);
    return { key, value: raw, shared: false };
  },

  async set(key, value) {
    assertBrowser();
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      window.localStorage.setItem(PREFIX + key, str);
    } catch (err) {
      /* Quota exceeded is the realistic failure. Surface it rather than
       * letting a brief look saved when it is not. */
      throw new Error(`Could not save "${key}": ${err.message}`);
    }
    return { key, value: str, shared: false };
  },

  async delete(key) {
    assertBrowser();
    window.localStorage.removeItem(PREFIX + key);
    return { key, deleted: true, shared: false };
  },

  async list(prefix = '') {
    assertBrowser();
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
    }
    return { keys, prefix, shared: false };
  },
};

/** Called once from the layout so components can keep using window.storage. */
export function installStorageShim() {
  if (typeof window !== 'undefined' && !window.storage) {
    window.storage = storage;
  }
}

/** Export every brief and tool state as one JSON blob. */
export async function exportAll() {
  const { keys } = await storage.list('');
  const out = {};
  for (const k of keys) {
    try {
      out[k] = (await storage.get(k)).value;
    } catch {
      /* removed between listing and reading */
    }
  }
  return { exported: new Date().toISOString(), version: 1, data: out };
}

/** Restore from an exportAll payload. Merges rather than replacing. */
export async function importAll(payload) {
  if (!payload?.data) throw new Error('No data in that file');
  let n = 0;
  for (const [k, v] of Object.entries(payload.data)) {
    await storage.set(k, v);
    n++;
  }
  return n;
}
