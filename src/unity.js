// Unity projects: which assets each level / room / scene / panel really uses, by following GUID references.
//
// A level prefab rarely names its images directly. It goes through intermediate assets:
//   prefab → Sprite (.asset, AssetRipper exports) → texture (.png)
//   prefab → SkeletonDataAsset → atlas asset → material → texture (+ skeleton .json)
//   prefab → material / ScriptableObject config → texture …
// and sounds / icons are often picked by an enum value (pickToolAudioId: 62 → AudioId.choi_re → choi_re.ogg).
// We read every .meta (guid → file), then walk the reference graph from each root (level prefab, scene, panel),
// stopping at other roots and at "hub" assets that reference half the project (level lists, managers…).
import { ext, stem } from './fsx.js';

const YAML_EXT = new Set(['prefab', 'unity', 'asset', 'mat', 'controller', 'overridecontroller', 'anim', 'spriteatlas', 'playable', 'mask', 'mixer', 'physicsmaterial2d', 'guiskin', 'fontsettings', 'renderTexture']);
const SKIP = new Set(['Library', 'Temp', 'Logs', 'obj', 'Packages', 'UserSettings', 'Build', 'Builds']);
const POPUP_WORD = /(panel|popup|pop|modal|dialog|window|sheet|overlay|toast)$/i;
const PANEL_NAME = /(panel|popup|screen|dialog|window|view|menu|shop|hud|page)/i;
const LEVEL_DIR = /(^|\/)(levels?|stages?|maps?|rounds?|puzzles?)(\/|$)/i;
const ROOM_DIR = /(^|\/)(rooms?|chapters?|worlds?|areas?|zones?|houses?|floors?)(\/|$)/i;
const NUM_NAME = /^(?:(?:level|lvl|lv|stage|room|chapter|world|map|round)[\s_\-]?)?0*(\d{1,4})(?:[\s_\-]?(.*))?$/i;
const HUB_REFS = 150;   // an asset that points at more files than this is a list / manager, not content

const humanize = (id) => id.replace(POPUP_WORD, '').replace(/(screen|page|scene|view)$/i, '').replace(/[_\-]+/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2').trim().replace(/^./, (c) => c.toUpperCase()) || id;

async function walk(dir, prefix, out, onFile) {
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'directory') {
      if (SKIP.has(name) || name.startsWith('.')) continue;
      await walk(h, prefix + name + '/', out, onFile);
    } else { out.push({ path: prefix + name, h }); onFile?.(out.length); }
  }
  return out;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

/** enum Name { a, b = 5, c } in C# sources → Map(lower enum name → Map(value → member)) */
function parseEnums(text, out) {
  for (const m of text.matchAll(/\benum\s+(\w+)\s*(?::\s*\w+\s*)?\{([^}]*)\}/g)) {
    const members = new Map(); let v = -1;
    for (let part of m[2].split(',')) {
      part = part.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[[^\]]*\]/g, '').trim();
      if (!part) continue;
      const mm = part.match(/^(\w+)\s*(?:=\s*(-?\d+))?/); if (!mm) continue;
      v = mm[2] !== undefined ? +mm[2] : v + 1;
      members.set(v, mm[1]);
    }
    if (members.size) out.set(m[1].toLowerCase(), members);
  }
}

/**
 * @returns {{ topics: Array, levelOrder: Map|null }} topics in the same shape detect.js returns for screens.
 */
export async function detectUnity(root, slots, assetRoot = 'Assets', onProgress) {
  let assets; try { assets = await root.getDirectoryHandle('Assets'); } catch { return { topics: [] }; }
  const files = await walk(assets, 'Assets/', [], (n) => n % 500 === 0 && onProgress?.('Đang đọc dự án Unity…', n, 0));
  const prefix = assetRoot ? assetRoot.replace(/\/$/, '') + '/' : '';
  const slotByPath = new Map(slots.map((s) => [prefix + s.id, s]));
  const fileByPath = new Map(files.map((f) => [f.path, f]));

  // 1) guid → file, from .meta
  const guid = new Map();
  const metas = files.filter((f) => f.path.endsWith('.meta'));
  await pool(metas, 16, async (f, k) => {
    const t = await (await f.h.getFile()).slice(0, 400).text();
    const g = t.match(/^guid:\s*([0-9a-f]{32})/m)?.[1];
    if (g) guid.set(g, f.path.slice(0, -5));
    if (k % 400 === 0) onProgress?.('Đang đọc .meta…', k, metas.length);
  });

  // 2) enums from C# (AudioId, ToolName…) and the files named like enum members
  const enums = new Map();
  await pool(files.filter((f) => /\.cs$/i.test(f.path)), 8, async (f) => {
    const t = await (await f.h.getFile()).text();
    if (t.includes('enum ')) parseEnums(t, enums);
  });
  const byStem = new Map();   // lower stem → [paths] of content files (slots + yaml assets)
  for (const f of files) {
    if (f.path.endsWith('.meta')) continue;
    const e = ext(f.path); if (!slotByPath.has(f.path) && !YAML_EXT.has(e)) continue;
    const k = stem(f.path.split('/').pop()).toLowerCase();
    (byStem.get(k) || byStem.set(k, []).get(k)).push(f.path);
  }
  // field "pickToolAudioId" → enum AudioId; "toolName" → ToolName (only enums whose members name files)
  const enumHasFiles = new Map([...enums].filter(([, mem]) => { let hit = 0; for (const n of mem.values()) if (byStem.has(n.toLowerCase())) hit++; return hit >= 3; }));
  const fieldEnum = new Map();
  const enumOfField = (field) => {
    const f = field.toLowerCase(); if (fieldEnum.has(f)) return fieldEnum.get(f);
    let best = null; for (const e of enumHasFiles.keys()) if ((f === e || f.endsWith(e)) && (!best || e.length > best.length)) best = e;
    fieldEnum.set(f, best); return best;
  };

  // 3) references of each yaml file (read lazily, cached)
  const refCache = new Map();
  async function refsOf(path) {
    if (refCache.has(path)) return refCache.get(path);
    const p = (async () => {
      const f = fileByPath.get(path); if (!f || !YAML_EXT.has(ext(path))) return [];
      const text = await (await f.h.getFile()).text();
      const out = new Set();
      for (const m of text.matchAll(/guid:\s*([0-9a-f]{32})/g)) { const p2 = guid.get(m[1]); if (p2 && p2 !== path) out.add(p2); }
      if (enumHasFiles.size) for (const m of text.matchAll(/^\s+(\w+):\s*(-?\d+)\s*$/gm)) {
        const e = enumOfField(m[1]); if (!e) continue;
        const name = enumHasFiles.get(e).get(+m[2]); if (!name || /^none$/i.test(name)) continue;
        for (const p2 of byStem.get(name.toLowerCase()) || []) out.add(p2);
      }
      return [...out];
    })();
    refCache.set(path, p);
    return p;
  }

  // 4) roots: level / room prefabs, scenes, panels
  const roots = [];
  for (const f of files) {
    const e = ext(f.path); if (e !== 'prefab' && e !== 'unity') continue;
    const nm = stem(f.path.split('/').pop()), dir = f.path.slice(0, f.path.lastIndexOf('/'));
    const num = nm.match(NUM_NAME);
    if (e === 'prefab' && num && (LEVEL_DIR.test(dir) || ROOM_DIR.test(dir) || /^(level|lvl|lv|stage|room|chapter)/i.test(nm))) {
      const kind = ROOM_DIR.test(dir) || /^(room|chapter)/i.test(nm) ? 'room' : 'level';
      roots.push({ path: f.path, kind, id: +num[1], suffix: num[2] || '', name: nm });
    } else if (e === 'unity') roots.push({ path: f.path, kind: 'screen', name: nm });
    else if (PANEL_NAME.test(nm)) roots.push({ path: f.path, kind: POPUP_WORD.test(nm) ? 'popup' : 'screen', name: nm });
  }
  if (!roots.length) return { topics: [] };
  const rootSet = new Set(roots.map((r) => r.path));

  // play order of levels from a config list ({index: 1, levelId: 13}, …) when the game has one
  let levelOrder = null;
  for (const f of files) {
    if (ext(f.path) !== 'asset' || !/level/i.test(f.path)) continue;
    const t = await (await f.h.getFile()).text();
    const pairs = [...t.matchAll(/index:\s*(\d+)\s*\n\s*-?\s*levelId:\s*(\d+)/g)];
    if (pairs.length >= 3) { levelOrder = new Map(pairs.map((m) => [+m[2], +m[1]])); break; }
  }

  // 5) closure from each root
  const hub = async (p) => (await refsOf(p)).length > HUB_REFS;
  async function closure(start) {
    const found = new Set(), seen = new Set([start]), stack = [start];
    while (stack.length) {
      const p = stack.pop();
      for (const r of await refsOf(p)) {
        if (seen.has(r)) continue; seen.add(r);
        const s = slotByPath.get(r); if (s) found.add(s.id);
        if (rootSet.has(r) || !YAML_EXT.has(ext(r)) || await hub(r)) continue;
        stack.push(r);
      }
    }
    return found;
  }
  const topics = [];
  let k = 0;
  for (const r of roots) {
    onProgress?.('Đang dò asset từng level / màn…', ++k, roots.length);
    const used = await closure(r.path);
    if (!used.size) continue;
    let name, n = 0, order;
    if (r.kind === 'level' || r.kind === 'room') {
      const play = levelOrder?.get(r.id);
      n = play || r.id;
      const label = r.kind === 'room' ? 'Room' : 'Level';
      name = play ? `${label} ${play}${r.suffix ? ' ' + humanize(r.suffix) : ''} · prefab ${r.name}` : `${label} ${r.id}${r.suffix ? ' ' + humanize(r.suffix) : ''}`;
      order = n + (r.suffix ? 0.5 : 0);
    } else {
      name = `${r.kind === 'popup' ? 'Popup' : 'Màn'} ${humanize(r.name)}`; order = k;
    }
    topics.push({ key: `unity:${r.path}`, id: r.kind === 'level' || r.kind === 'room' ? `${r.kind}_${r.name}` : r.name, kind: r.kind, n, prefabId: r.id, suffix: r.suffix || '',
      name, file: r.path, slots: used, dyn: new Set(), order });
  }

  // 6) art shared by many levels (tutorial hand, common UI…) gets its own topic instead of sitting in every level
  const lv = topics.filter((t) => t.kind === 'level' || t.kind === 'room');
  if (lv.length >= 4) {
    const count = new Map();
    for (const t of lv) for (const id of t.slots) count.set(id, (count.get(id) || 0) + 1);
    const limit = Math.max(3, Math.ceil(lv.length * 0.3));
    const shared = new Set([...count].filter(([, c]) => c >= limit).map(([id]) => id));
    if (shared.size) {
      for (const t of lv) for (const id of shared) t.slots.delete(id);
      topics.push({ key: 'unity:shared-levels', id: 'level_shared', kind: lv[0].kind, n: 0, name: `Dụng cụ / hiệu ứng dùng chung (${limit}+ ${lv[0].kind === 'room' ? 'room' : 'level'})`,
        file: 'nhiều level', slots: shared, dyn: new Set(), order: -1 });
    }
  }
  // 7) per-level art no prefab points at (level-select thumbnails, win / lock icons…): families "<name>_<n>" or
  //    "lv<n>_<name>" whose numbers match the level prefabs ("lv12_clean", "icon_win_12" → 12.prefab)
  const lvTopics = topics.filter((t) => (t.kind === 'level' || t.kind === 'room') && t.prefabId != null && !t.suffix);
  if (lvTopics.length >= 4) {
    const byId = new Map(lvTopics.map((t) => [t.prefabId, t]));
    const assigned = new Set(topics.flatMap((t) => [...t.slots]));
    const fam = new Map();
    for (const s of slots) {
      if (assigned.has(s.id)) continue;
      let m = s.key.match(/^(?:lv|lvl|level)[_\-]?0*(\d{1,3})(?:[_\-](.*))?$/i), fk, n, explicit = false;
      if (m) { fk = 'lv#' + (m[2] || '').toLowerCase().replace(/\d+/g, '#'); n = +m[1]; explicit = true; }
      else { m = s.key.match(/^(.*?[a-z])[_\-]?0*(\d{1,3})(?:_\d)?$/i); if (!m) continue; fk = m[1].toLowerCase(); n = +m[2]; }
      (fam.get(fk) || fam.set(fk, { explicit, list: [] }).get(fk)).list.push({ s, n });
    }
    const extra = new Map(), later = [];
    // explicit "lv<n>" families first (they may open a topic for a level that has art but no prefab), then the rest
    for (const { explicit, list } of [...fam.values()].sort((x, y) => y.explicit - x.explicit)) {
      const nums = new Set(list.map((x) => x.n));
      const hits = [...nums].filter((n) => byId.has(n) || extra.has(n)).length;
      if (list.length < (explicit ? 3 : Math.max(5, lvTopics.length * 0.3)) || hits < Math.min(nums.size, byId.size) * 0.6) continue;
      for (const { s, n } of list) {
        const t = byId.get(n) || extra.get(n);
        if (t) t.slots.add(s.id);
        else if (explicit) {   // "lv36_*" with no 36.prefab in this build: keep them together as their own level
          extra.set(n, { key: `unity:level-art:${n}`, id: `level_art_${n}`, kind: lvTopics[0].kind, n: 1000 + n, name: `Level lv${n} · chỉ có ảnh (không thấy prefab)`, file: 'tên file', slots: new Set([s.id]), dyn: new Set(), order: 1000 + n });
        }
      }
    }
    topics.push(...extra.values());
  }

  // 8) sounds the game plays by enum name from code (win, step done, music…) and that no prefab uses
  const assigned2 = new Set(topics.flatMap((t) => [...t.slots]));
  const codeSounds = new Set();
  for (const mem of enumHasFiles.values()) for (const name of mem.values()) {
    for (const p of byStem.get(name.toLowerCase()) || []) { const s = slotByPath.get(p); if (s && s.kind === 'sound' && !assigned2.has(s.id)) codeSounds.add(s.id); }
  }
  if (codeSounds.size) topics.push({ key: 'unity:code-sounds', id: 'code_sounds', kind: 'screen', n: 0, name: 'Âm thanh chung (game gọi theo tên)', file: 'enum trong code', slots: codeSounds, dyn: new Set(), order: 999 });

  return { topics, levelOrder };
}
