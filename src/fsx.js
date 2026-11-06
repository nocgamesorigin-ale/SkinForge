// Folder access (File System Access API) + recent projects in IndexedDB.
// Nothing leaves the machine: the tool only reads/writes the folder the user picks.

export const fsSupported = 'showDirectoryPicker' in window;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.reskin', '.falcon', '.falcon-publish', 'Library', 'Temp', 'Logs', 'obj', 'build', '.idea', '.vscode']);
export const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp']);

export const ext = (name) => (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
export const stem = (name) => name.replace(/\.[^.]+$/, '');

export async function pickFolder() {
  return window.showDirectoryPicker({ id: 'skinforge-game', mode: 'readwrite' });
}

export async function ensurePermission(handle, mode = 'readwrite') {
  if (!handle.queryPermission) return true;   // origin-private folders (OPFS) need no prompt
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  return (await handle.requestPermission({ mode })) === 'granted';
}

/** Resolve a/b/c inside a directory handle. */
export async function getDir(root, path, create = false) {
  let d = root;
  for (const part of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, { create });
  return d;
}
export async function tryGetDir(root, path) {
  try { return await getDir(root, path); } catch { return null; }
}
export async function getFile(root, path) {
  const parts = path.split('/'); const name = parts.pop();
  const dir = await getDir(root, parts.join('/'));
  return (await dir.getFileHandle(name)).getFile();
}
export async function writeFile(root, path, blob) {
  const parts = path.split('/'); const name = parts.pop();
  const dir = await getDir(root, parts.join('/'), true);
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob); await w.close();
}
export async function removeEntry(root, path, recursive = false) {
  const parts = path.split('/'); const name = parts.pop();
  const dir = await getDir(root, parts.join('/'));
  await dir.removeEntry(name, { recursive });
}
export async function readJSON(root, path) {
  try { return JSON.parse(await (await getFile(root, path)).text()); } catch { return null; }
}
export const writeJSON = (root, path, data) => writeFile(root, path, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));

/** Every image file under `dir`, as { path, file }. */
export async function walkImages(dir, prefix = '', out = []) {
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') {
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
      await walkImages(h, prefix + name + '/', out);
    } else if (IMAGE_EXT.has(ext(name))) {
      out.push({ path: prefix + name, file: await h.getFile() });
    }
  }
  return out;
}

/** Guess the engine and the asset folder of a picked game folder. */
export async function detectProject(root) {
  const has = async (p, kind = 'file') => {
    try {
      const parts = p.split('/'); const name = parts.pop(); const d = await getDir(root, parts.join('/'));
      kind === 'dir' ? await d.getDirectoryHandle(name) : await d.getFileHandle(name);
      return true;
    } catch { return false; }
  };
  let engine = 'Thư mục ảnh';
  let pkg = null;
  if (await has('package.json')) { try { pkg = JSON.parse(await (await getFile(root, 'package.json')).text()); } catch {} }
  const deps = pkg ? JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies }) : '';
  if (await has('.falcon', 'dir') || deps.includes('@falcongames/game-client-sdk')) engine = 'Falcon IDE';
  else if (/gamekit/i.test(deps) || await has('.gamekit', 'dir')) engine = 'GameKit';
  else if (await has('ProjectSettings', 'dir') && await has('Assets', 'dir')) engine = 'Unity';
  else if (await has('project.godot')) engine = 'Godot';
  else if (await has('vite.config.ts') || await has('vite.config.js')) engine = 'Vite';
  else if (pkg) engine = 'Web (npm)';

  const candidates = engine === 'Unity' ? ['Assets'] : ['src/assets', 'assets', 'public/assets', 'public', 'res', 'resources', 'Assets'];
  let assetRoot = '';
  for (const c of candidates) if (await has(c, 'dir')) { assetRoot = c; break; }
  return { engine, assetRoot, name: pkg?.name || root.name };
}

/* ---------- recent projects (directory handles survive reloads in IndexedDB) ---------- */
const DB = 'skinforge', STORE = 'recent';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode); const s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error);
  });
}
export const recentList = async () => { try { return (await tx('readonly', (s) => s.getAll())) || []; } catch { return []; } };
export const recentPut = (rec) => tx('readwrite', (s) => s.put(rec)).catch(() => {});
export const recentDelete = (id) => tx('readwrite', (s) => s.delete(id)).catch(() => {});
