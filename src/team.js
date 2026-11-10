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
