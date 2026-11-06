// Project model: asset slots, groups and their rules, image sets, reskins and the checks.
import { analyze, analyzeAudio, placement, fmtSec } from './imaging.js';
import { ext, stem, AUDIO_EXT } from './fsx.js';

/** Who reskins what: art + effects go to the Artist / Anim brief; sound stays with Game Design. */
export const KINDS = {
  art: { label: 'Art', owner: 'Artist' },
  fx: { label: 'Effect', owner: 'Anim' },
  sound: { label: 'Âm thanh', owner: 'Game Design' },
};
const FX_RE = /(^|[\/_\-\s.])(fx|vfx|effects?|particles?|anim(ation)?s?|sparkles?|splash|glow|smoke|explosions?|shine|rays?|trail|flare)([\/_\-\s.\d]|$)/i;
export const kindOf = (path) => AUDIO_EXT.has(ext(path)) ? 'sound' : FX_RE.test(path) ? 'fx' : 'art';

/*
 Slot  = one image the game uses: { id: "items/bag_1_0.webp", key: "bag_1_0", dir, ext, group, w, h, alpha, bytes, set, idx }
 Set   = images that must line up with each other (bag_1_0 … bag_1_4): { id, group, members: [slotId] }
 Group = first folder under the asset root; rule 'free' (content may change shape/size, frame is contained)
         or 'fixed' (keep the frame's aspect ratio).
 Reskin = { blob, name, w, h, alpha, bbox, preview(url), checks:[{level,title,detail}], status }
*/

export const RULES = {
  free: { label: 'Khung tự do', hint: 'Dáng và kích thước món đồ tự do; ảnh được co vừa khung, không méo.' },
  fixed: { label: 'Giữ tỉ lệ khung', hint: 'Giữ tỉ lệ khung hình như ảnh gốc (sai số 2%).' },
  sound: { label: 'Âm thanh · giữ định dạng', hint: 'File mới cùng định dạng với file gốc (mp3 → mp3); độ dài nên gần bằng.' },
};
export const SAFE = { min: 0.7, max: 0.9, warnMin: 0.6, warnMax: 0.98, fill: 0.86 };

export async function buildSlots(entries, onProgress) {
  // entries: [{ path, blob }]
  const slots = [];
  let done = 0;
  const queue = [...entries];
  const worker = async () => {
    while (queue.length) {
      const e = queue.shift();
      try {
        const parts = e.path.split('/'); const name = parts.pop();
        const base = { id: e.path, key: stem(name), name, dir: parts.join('/'), ext: ext(name), group: parts[0] || '(gốc)', bytes: e.blob.size, kind: kindOf(e.path) };
        if (base.kind === 'sound') {
          slots.push({ ...base, ...(await analyzeAudio(e.blob)) });
        } else {
          const a = await analyze(e.blob);
          slots.push({ ...base, w: a.w, h: a.h, alpha: a.alpha,
            fill: +Math.max(a.bbox.w, a.bbox.h).toFixed(3) });   // how much of its frame the original's content fills
        }
      } catch { /* unreadable file: skip */ }
      onProgress?.(++done, entries.length);
    }
  };
  await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  slots.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return slots;
}

/** Group "<prefix>_<n>" images of one folder with equal size into sets (e.g. 5 cleaning stages of an item). */
export function findSets(slots) {
  const buckets = new Map();
  for (const s of slots) {
    if (s.kind === 'sound') continue;
    const m = s.key.match(/^(.+)_(\d+)$/);
    if (!m) continue;
    const k = `${s.dir}/${m[1]}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push({ s, idx: +m[2] });
  }
  const sets = {};
  for (const [k, arr] of buckets) {
    if (arr.length < 3) continue;
    const { w, h } = arr[0].s;
    if (!arr.every((x) => x.s.w === w && x.s.h === h)) continue;
    arr.sort((a, b) => a.idx - b.idx);
    const id = k.replace(/^\//, '');
    sets[id] = { id, name: id.split('/').pop(), group: arr[0].s.group, members: arr.map((x) => x.s.id) };
    arr.forEach((x) => { x.s.set = id; x.s.idx = x.idx; });
  }
  return sets;
}

export function defaultGroups(slots, sets) {
  const groups = {};
  for (const s of slots) {
    const g = (groups[s.group] ||= { name: s.group, count: 0, sets: 0, rule: 'fixed', sounds: 0 });
    g.count++; if (s.kind === 'sound') g.sounds++;
  }
  for (const g of Object.values(groups)) if (g.sounds === g.count) g.rule = 'sound';
  const inSets = {};
  for (const set of Object.values(sets)) { groups[set.group].sets++; inSets[set.group] = (inSets[set.group] || 0) + set.members.length; }
  // "free frame" only where image sets make up most of the folder (items), not for a UI folder
  // that merely contains a numbered series such as room_1 … room_3
  for (const g of Object.values(groups)) if ((inSets[g.name] || 0) >= g.count * 0.5) g.rule = 'free';
  return groups;
}

/** Find the slot a dropped file belongs to: by relative path first, then by file name. */
export function matcher(slots) {
  // images and sounds are looked up separately: ui/coin.webp and snd/coin.mp3 must not collide
  const maps = { image: { byPath: new Map(), byKey: new Map() }, sound: { byPath: new Map(), byKey: new Map() } };
  for (const s of slots) {
    const m = maps[s.kind === 'sound' ? 'sound' : 'image'];
    m.byPath.set(`${s.dir ? s.dir + '/' : ''}${s.key}`.toLowerCase(), s);
    m.byKey.set(s.key, m.byKey.has(s.key) ? null : s);   // null = ambiguous name
  }
  return (path) => {
    const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
    const { byPath, byKey } = maps[AUDIO_EXT.has(ext(clean)) ? 'sound' : 'image'];
    const noExt = clean.replace(/\.[^./]+$/, '');
    const segs = noExt.split('/');
    for (let i = 0; i < segs.length; i++) {
      const hit = byPath.get(segs.slice(i).join('/').toLowerCase());
      if (hit) return { slot: hit };
    }
    const key = segs[segs.length - 1];
    const s = byKey.get(key);
    if (s) return { slot: s };
    if (s === null) return { ambiguous: key };
    return { unknown: key };
  };
}

export async function makeReskin(blob, name) {
  if (AUDIO_EXT.has(ext(name))) return { blob, name, kind: 'sound', ...(await analyzeAudio(blob)) };
  const a = await analyze(blob);
  return { blob, name, ...a };
}

function checkSound(slot, r, add) {
  const fe = ext(r.name);
  if (fe !== slot.ext) add('error', 'Sai định dạng', `File .${fe}, game dùng .${slot.ext} — xuất lại sang .${slot.ext} (giữ tên ${slot.key}.${slot.ext})`);
  else add('ok', 'Định dạng', `.${fe} khớp file gốc`);
  const d = slot.duration || 0, ratio = d ? r.duration / d : 1;
  if (d && (ratio > 1.6 || ratio < 0.5)) add('warn', 'Độ dài khác nhiều', `${fmtSec(r.duration)} so với gốc ${fmtSec(d)} — kiểm tra nếu âm thanh được canh theo animation`);
  else add('ok', 'Độ dài', `${fmtSec(r.duration)} (gốc ${fmtSec(d)})`);
  if (r.blob.size > Math.max(slot.bytes * 3, slot.bytes + 300_000)) add('warn', 'File nặng hơn nhiều', `${Math.round(r.blob.size / 1024)} KB so với gốc ${Math.round(slot.bytes / 1024)} KB — nên nén (mono, bitrate thấp hơn)`);
  if (slot.channels && r.channels !== slot.channels) add('info', 'Số kênh', `${r.channels === 1 ? 'Mono' : 'Stereo'} (gốc ${slot.channels === 1 ? 'mono' : 'stereo'})`);
}

/** Run every check for one slot's reskin; set-level checks need the other members. */
export function checkSlot(project, slot) {
  const r = project.reskins.get(slot.id);
  if (!r) return null;
  const rule = project.groups[slot.group]?.rule || 'fixed';
  const checks = [];
  const add = (level, title, detail) => checks.push({ level, title, detail });
  add('ok', 'Tên file khớp', `${r.name} → ${slot.id}`);
  if (slot.kind === 'sound' || r.kind === 'sound') {
    if (slot.kind !== r.kind) add('error', 'Sai loại file', slot.kind === 'sound' ? 'Ô này là âm thanh, file nhập vào là ảnh' : 'Ô này là ảnh, file nhập vào là âm thanh');
    else checkSound(slot, r, add);
    const st = checks.some((c) => c.level === 'error') ? 'error' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
    r.checks = checks; r.status = st;
    return st;
  }

  if (slot.alpha && !r.alpha) add('error', 'Thiếu nền trong suốt', 'Ảnh gốc có nền trong suốt; bản reskin cần PNG có kênh alpha.');
  else add('ok', slot.alpha ? 'Nền trong suốt' : 'Nền', slot.alpha ? 'Có kênh alpha' : 'Ảnh gốc không cần nền trong suốt');

  const ro = slot.w / slot.h, rr = r.w / r.h, diff = Math.abs(rr / ro - 1);
  const tol = Math.max(0.02, 1.5 / Math.min(r.w, r.h, slot.w, slot.h));   // ±1 px rounding on small images
  if (rule === 'fixed' && diff > tol) add('error', 'Sai tỉ lệ khung', `Tỉ lệ ${rr.toFixed(2)}, cần ${ro.toFixed(2)} (giữ tỉ lệ khung)`);
  else if (diff > tol) add('info', 'Khung ảnh (tự do)', `Tỉ lệ ${rr.toFixed(2)}, gốc ${ro.toFixed(2)} — được phép, ảnh co vừa khung`);
  else add('ok', 'Tỉ lệ khung', `${rr.toFixed(2)} khớp gốc`);

  if (r.w < slot.w * 0.9 || r.h < slot.h * 0.9) add('warn', 'Độ phân giải thấp', `${r.w}×${r.h} nhỏ hơn khung ${slot.w}×${slot.h} — sẽ bị phóng to, có thể mờ`);
  else add('ok', 'Độ phân giải', `${r.w}×${r.h} → xuất ${slot.w}×${slot.h}`);

  const fit = slot.set ? project.fits[slot.set] : project.fits[slot.id];
  const place = placement(slot.w, slot.h, r, fit || null).content;
  if (rule === 'free' && r.alpha) {
    const fill = Math.max(place.w, place.h);
    const pct = Math.round(fill * 100), orig = slot.fill ?? 0.85;
    // measured against the original: art that is meant to reach the edge (foam, splashes) is not flagged
    if (fill < Math.min(SAFE.warnMin, orig - 0.15)) add('warn', 'Món đồ nhỏ trong khung', `Chiếm ${pct}% khung, ảnh gốc ${Math.round(orig * 100)}% (gợi ý ${SAFE.min * 100}–${SAFE.max * 100}%) — dùng "Tự cắt & căn"`);
    else if (fill > Math.max(SAFE.warnMax, orig + 0.03)) add('warn', 'Món đồ sát mép', `Chiếm ${pct}% khung — dễ bị cắt khi hiển thị`);
    else add('ok', 'Vùng an toàn', `Món đồ chiếm ${pct}% khung`);
  }

  if (slot.set) {
    const set = project.sets[slot.set];
    const others = set.members.filter((id) => id !== slot.id && project.reskins.get(id));
    if (others.length) {
      const boxes = others.map((id) => {
        const o = project.slots.find((s) => s.id === id);
        return placement(o.w, o.h, project.reskins.get(id), fit || null).content;
      });
      const med = (k) => { const v = boxes.map(k).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
      const cx = med((b) => b.x + b.w / 2), cy = med((b) => b.y + b.h / 2), mw = med((b) => b.w), mh = med((b) => b.h);
      const dx = (place.x + place.w / 2 - cx) * slot.w, dy = (place.y + place.h / 2 - cy) * slot.h;
      const dsz = Math.max(Math.abs(place.w / mw - 1), Math.abs(place.h / mh - 1));
      if (Math.hypot(dx / slot.w, dy / slot.h) > 0.02 || dsz > 0.05)
        add('error', 'Lệch so với bộ', `Lệch (${dx >= 0 ? '+' : ''}${Math.round(dx)}, ${dy >= 0 ? '+' : ''}${Math.round(dy)}) px · cỡ khác ${Math.round(dsz * 100)}% so với ${others.length} ảnh reskin còn lại`);
      else add('ok', 'Khớp với bộ', `Trùng vị trí với ${others.length} ảnh reskin còn lại`);
    }
    const missing = set.members.length - set.members.filter((id) => project.reskins.get(id)).length;
    if (missing) add('warn', 'Bộ chưa đủ ảnh', `Còn thiếu ${missing}/${set.members.length} ảnh trong bộ ${set.name}`);
  }

  const status = checks.some((c) => c.level === 'error') ? 'error' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
  r.checks = checks; r.status = status;
  return status;
}

export function checkAll(project) {
  for (const s of project.slots) if (project.reskins.has(s.id)) checkSlot(project, s);
}

/** Auto-fit a set (or a single slot): crop to the union of visible content, fill the safe zone. */
export function autoFit(project, ids) {
  const rs = ids.map((id) => project.reskins.get(id)).filter(Boolean);
  if (!rs.length) return null;
  const x0 = Math.min(...rs.map((r) => r.bbox.x)), y0 = Math.min(...rs.map((r) => r.bbox.y));
  const x1 = Math.max(...rs.map((r) => r.bbox.x + r.bbox.w)), y1 = Math.max(...rs.map((r) => r.bbox.y + r.bbox.h));
  return { crop: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, fill: SAFE.fill };
}

export function summary(project) {
  let ok = 0, warn = 0, error = 0;
  for (const r of project.reskins.values()) { if (r.status === 'error') error++; else if (r.status === 'warn') warn++; else ok++; }
  return { total: project.slots.length, ok, warn, error, missing: project.slots.length - project.reskins.size };
}
