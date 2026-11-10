// Team progress through the shared folder (<game>/.reskin, on Drive / OneDrive / a network share).
// Each person writes only their own file, so synced copies never fight over one file:
//   .reskin/team/<name>.json   who, which topics they took, how far they are, what they handed in
//   .reskin/inbox/<name>/…     the art they handed in, under the game's asset paths
// Game Design keeps the assignment (topic.owner) and what it has received in project.json.
import * as F from './fsx.js';

export const slug = (n) => (n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
  .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'artist';

/** base = { handle, pre } — pre is '.reskin/' for a game folder, '' when the .reskin folder itself was linked. */
export async function readTeam(base) {
  const dir = await F.tryGetDir(base.handle, `${base.pre}team`);
  if (!dir) return { list: [], sig: '' };
  const list = []; let sig = '';
  for await (const [name, h] of dir.entries()) {
    if (h.kind !== 'file' || !name.endsWith('.json')) continue;
    const f = await h.getFile(); sig += `${name}:${f.lastModified};`;
    try { list.push({ ...JSON.parse(await f.text()), file: name }); } catch { /* half-synced file: next poll */ }
  }
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { list, sig };
}

export const writeMe = (base, me) => F.writeJSON(base.handle, `${base.pre}team/${slug(me.name)}.json`, me);

/** Hand in art: one file per slot under inbox/<name>/<asset path>. */
export async function handIn(base, name, items, onProgress) {
  let i = 0;
  for (const it of items) { await F.writeFile(base.handle, `${base.pre}inbox/${slug(name)}/${it.path}`, it.blob); onProgress?.(++i, items.length); }
}

/** Files one person handed in, as [{ path, blob }] (paths relative to the asset folder). */
export async function readInbox(base, who) {
  const dir = await F.tryGetDir(base.handle, `${base.pre}inbox/${slug(who)}`);
  if (!dir) return [];
  return (await F.walkImages(dir)).map((f) => ({ path: f.path, blob: f.file }));
}

/* ---------- live previews: each person's work in progress, small, so the team and Game Design can see it ---------- */
const previewPath = (base, name, slotId) => `${base.pre}preview/${slug(name)}/${slotId}.webp`;

/** Shrink a drawn image to a small WebP (max 320 px) for the shared preview. */
export async function thumb(blob, max = 320) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return new Promise((res) => c.toBlob((b) => res(b), 'image/webp', 0.82));
}
export const writePreview = (base, name, slotId, blob) => F.writeFile(base.handle, previewPath(base, name, slotId), blob);
export async function readPreview(base, name, slotId) {
  try { return await F.getFile(base.handle, previewPath(base, name, slotId)); } catch { return null; }
}

/** slot id → [{ name, h, preview }] for everyone except `me`: who has drawn this image (h changes when they redraw it). */
export function othersBySlot(team, me) {
  const out = new Map();
  for (const m of team) {
    if (me && slug(m.name) === slug(me)) continue;
    for (const [id, h] of Object.entries(m.drawn || {})) (out.get(id) || out.set(id, []).get(id)).push({ name: m.name, h, preview: !!m.previews?.[id] });
  }
  return out;
}

/** Per-topic numbers for the board: total cards (no sound), drawn by the people on it, handed in, received by Game Design. */
export function topicProgress(sc, p, team, received) {
  const cards = new Map();   // card id → slot ids
  for (const id of sc.slots) {
    const s = p.slotById.get(id); if (!s || s.kind === 'sound') continue;
    const k = s.set || s.id; if (!cards.has(k)) cards.set(k, []); cards.get(k).push(id);
  }
  const handed = new Set(team.flatMap((m) => Object.keys(m.handed || {})));
  const count = (has) => [...cards.values()].filter((ids) => ids.every(has)).length;
  const people = [...new Set([sc.owner, ...team.filter((m) => (m.claims || []).includes(sc.id)).map((m) => m.name)].filter(Boolean))];
  const drawn = Math.max(0, ...team.filter((m) => people.includes(m.name) || m.topics?.[sc.id]).map((m) => m.topics?.[sc.id]?.done || 0));
  return { total: cards.size, people, drawn: Math.min(drawn, cards.size), handed: count((id) => handed.has(id)), received: count((id) => received.has(id)) };
}
