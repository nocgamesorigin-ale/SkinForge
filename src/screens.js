// Screens / popups: Game Design groups assets by where they appear in the game (Popup Complete, Shop…)
// and writes a request for each role (Art, Anim) with reference images. Shipped inside the brief.
import * as F from './fsx.js';

export const PRESETS = ['Popup Complete', 'Popup Out of Moves', 'Shop', 'Main Menu', 'Gameplay HUD', 'Settings', 'Popup Daily Reward', 'Loading'];
export const ROLES = { art: 'Yêu cầu Art', anim: 'Yêu cầu Anim' };

export function newScreen(name) {
  return { id: 'sc_' + Math.random().toString(36).slice(2, 8), name, slots: [], art: { text: '', refs: [] }, anim: { text: '', refs: [] },
    auto: null,    // { key, file, kind, dyn:[group] } when found in the game's code
    shot: null,    // overview image of the whole screen: { name, blob, url }
    owner: '' };   // artist Game Design gave this topic to
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
  ...(sc.auto ? { auto: sc.auto } : {}), ...(sc.shot ? { shot: { name: sc.shot.name } } : {}), ...(sc.owner ? { owner: sc.owner } : {}),
}));

export const refPath = (sc, role, name) => `${sc.id}/${role}/${name}`;

/** Rebuild screens from saved JSON; getRef(path) returns the stored ref image (Blob) or null. */
export async function revive(saved, getRef) {
  const out = [];
  for (const s of saved || []) {
    const sc = { ...newScreen(s.name), id: s.id, slots: s.slots || [], auto: s.auto || null, owner: s.owner || '' };
    if (s.shot) { const blob = await getRef(refPath(sc, 'shot', s.shot.name)); if (blob) sc.shot = { name: s.shot.name, blob, url: URL.createObjectURL(blob) }; }
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

/** Every stored image of a screen as [path, blob] (refs + overview), for the brief. */
export function screenFiles(sc) {
  const out = [];
  for (const role of Object.keys(ROLES)) for (const r of sc[role].refs) out.push([refPath(sc, role, r.name), r.blob]);
  if (sc.shot) out.push([refPath(sc, 'shot', sc.shot.name), sc.shot.blob]);
  return out;
}

/** Merge screens found in the game's code: update the ones found before (by key), add new ones. Manual assets stay. */
export function mergeDetected(screens, found) {
  let added = 0, updated = 0;
  for (const d of found) {
    let sc = screens.find((s) => s.auto?.key === d.key);
    if (!sc) sc = screens.find((s) => !s.auto && s.name.toLowerCase() === d.name.toLowerCase());
    if (!sc) {
      sc = { ...newScreen(d.name), id: 'sc_' + d.id.replace(/[^\w-]+/g, '_').slice(0, 40) };
      while (screens.some((s) => s.id === sc.id)) sc.id += '_';
      screens.push(sc); added++;
    } else updated++;
    sc.slots = [...new Set([...sc.slots, ...d.slots])];
    sc.auto = { key: d.key, file: d.file, kind: d.kind, dyn: d.dyn };
  }
  return { added, updated };
}

/** Assets of a screen counted per group: a set of images counts once ("bộ"). Groups the code picks at runtime
 *  (e.g. any item) are listed with their whole size. */
export function breakdown(sc, p) {
  const g = new Map();
  const row = (name) => g.get(name) || g.set(name, { group: name, cards: new Set(), files: 0, dyn: false, total: 0 }).get(name);
  for (const id of sc.slots) {
    const s = p.slotById.get(id); if (!s) continue;
    const r = row(s.group); r.cards.add(s.set || s.id); r.files++;
  }
  for (const d of sc.auto?.dyn || []) {
    const grp = d.split('/')[0], r = row(grp); r.dyn = true;
    const cards = new Set(p.slots.filter((s) => s.group === grp).map((s) => s.set || s.id)); r.total = cards.size;
  }
  return [...g.values()].filter((r) => r.cards.size || r.total).map((r) => ({ ...r, cards: r.cards.size })).sort((a, b) => (b.dyn - a.dyn) || b.cards - a.cards);
}

/** Topic sections in the side list, in this order. */
export const TYPES = [
  { type: 'screen', label: 'Màn' }, { type: 'popup', label: 'Popup' }, { type: 'room', label: 'Room' },
  { type: 'level', label: 'Level' }, { type: 'item', label: 'Item / món' }, { type: 'custom', label: 'Khác' },
];
export function typeOf(sc) {
  if (sc.auto?.kind) return sc.auto.kind;
  const n = sc.name.toLowerCase();
  if (/^popup|panel|dialog/.test(n)) return 'popup';
  if (/^(room|phòng)/.test(n)) return 'room';
  if (/^(level|lv|màn chơi)/.test(n)) return 'level';
  if (/^(màn|screen|menu|hud|gameplay|loading|shop|settings)/.test(n)) return 'screen';
  return 'custom';
}

/** Art / Effect / Animation / Sound counts of a topic (a set of images counts once). */
export function kindCounts(sc, p) {
  const out = { art: new Set(), fx: new Set(), anim: new Set(), sound: new Set() };
  for (const id of sc.slots) { const s = p.slotById.get(id); if (s && out[s.kind]) out[s.kind].add(s.set || s.id); }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.size]));
}
