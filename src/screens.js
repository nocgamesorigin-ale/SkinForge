// Screens / popups: Game Design groups assets by where they appear in the game (Popup Complete, Shop…)
// and writes a request for each role (Art, Anim) with reference images. Shipped inside the brief.
import * as F from './fsx.js';

export const PRESETS = ['Popup Complete', 'Popup Out of Moves', 'Shop', 'Main Menu', 'Gameplay HUD', 'Settings', 'Popup Daily Reward', 'Loading'];
export const ROLES = { art: 'Yêu cầu Art', anim: 'Yêu cầu Anim' };

export function newScreen(name) {
  return { id: 'sc_' + Math.random().toString(36).slice(2, 8), name, slots: [], art: { text: '', refs: [] }, anim: { text: '', refs: [] } };
}

/** slot id → [screen names] */
export function screenIndex(screens) {
  const m = new Map();
  for (const sc of screens) for (const id of sc.slots) { if (!m.has(id)) m.set(id, []); m.get(id).push(sc.name); }
  return m;
}

/** Without blobs / object URLs, for project.json and brief.json. */
export const serialize = (screens, keepSlots = null) => screens.map((sc) => ({
  id: sc.id, name: sc.name, slots: keepSlots ? sc.slots.filter((id) => keepSlots.has(id)) : sc.slots,
  art: { text: sc.art.text, refs: sc.art.refs.map((r) => ({ name: r.name })) },
  anim: { text: sc.anim.text, refs: sc.anim.refs.map((r) => ({ name: r.name })) },
}));

export const refPath = (sc, role, name) => `${sc.id}/${role}/${name}`;

/** Rebuild screens from saved JSON; getRef(path) returns the stored ref image (Blob) or null. */
export async function revive(saved, getRef) {
  const out = [];
  for (const s of saved || []) {
    const sc = { ...newScreen(s.name), id: s.id, slots: s.slots || [] };
    for (const role of Object.keys(ROLES)) {
      sc[role].text = s[role]?.text || '';
      for (const r of s[role]?.refs || []) {
        const blob = await getRef(refPath(sc, role, r.name));
        if (blob) sc[role].refs.push({ name: r.name, blob, url: URL.createObjectURL(blob) });
      }
    }
    out.push(sc);
  }
  return out;
}

/** Folder projects keep ref images in <game>/.reskin/refs/<screen>/<role>/<file>. */
export const folderRef = {
  read: (root) => async (path) => { try { return await F.getFile(root, `.reskin/refs/${path}`); } catch { return null; } },
  write: (root, path, blob) => F.writeFile(root, `.reskin/refs/${path}`, blob),
  remove: async (root, path) => { try { await F.removeEntry(root, `.reskin/refs/${path}`); } catch {} },
  removeScreen: async (root, id) => { try { await F.removeEntry(root, `.reskin/refs/${id}`, true); } catch {} },
};

/** Keep ref file names unique and safe inside a screen/role. */
export function refName(existing, file) {
  const base = file.name.replace(/[^\w.\-]+/g, '_') || 'ref.png';
  let name = base, n = 2;
  while (existing.some((r) => r.name === name)) name = base.replace(/(\.[^.]+)?$/, `_${n++}$1`);
  return name;
}
