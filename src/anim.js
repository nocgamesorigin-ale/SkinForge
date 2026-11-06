// Animation files: recognise the format and pull out what the game depends on
// (animation / clip names, frame rate, duration, frames, referenced textures).
import { ext } from './fsx.js';

const TYPES = {
  spine: 'Spine (JSON)', 'spine-skel': 'Spine (binary .skel)', 'spine-atlas': 'Spine / libGDX atlas',
  lottie: 'Lottie', dotlottie: 'Lottie (.lottie)', sheet: 'Sprite sheet (TexturePacker)', plist: 'Sprite sheet (.plist)',
  dragonbones: 'DragonBones', 'unity-anim': 'Unity AnimationClip', 'unity-controller': 'Unity Animator Controller',
};
export const animTypeLabel = (t) => TYPES[t] || t;

const uniq = (a) => [...new Set(a)];

/** null when the file is not an animation (e.g. a game's data.json). */
export async function analyzeAnim(blob, name) {
  const e = ext(name);
  if (e === 'skel') return { animType: 'spine-skel', names: [], note: 'File nhị phân — chỉ kiểm tra được định dạng' };
  if (e === 'lottie') return { animType: 'dotlottie', names: [], note: 'Gói .lottie (zip) — chỉ kiểm tra được định dạng' };
  const text = await blob.text();
  if (e === 'atlas') {
    const pages = text.split(/\r?\n/).filter((l) => /\.(png|webp|jpe?g)\s*$/i.test(l.trim())).map((l) => l.trim());
    const regions = text.split(/\r?\n/).filter((l, i, a) => l && !/^\s/.test(l) && !l.includes(':') && !/\.(png|webp|jpe?g)$/i.test(l.trim()) && i > 0).map((l) => l.trim());
    return { animType: 'spine-atlas', names: uniq(regions), textures: pages, label: 'vùng ảnh' };
  }
  if (e === 'anim') {
    if (!/AnimationClip/.test(text)) return null;
    const fr = +(text.match(/m_SampleRate:\s*([\d.]+)/)?.[1] || 0);
    const stop = +(text.match(/m_StopTime:\s*([\d.]+)/)?.[1] || 0);
    return { animType: 'unity-anim', names: [text.match(/m_Name:\s*(.+)/)?.[1]?.trim()].filter(Boolean), fps: fr || null, duration: stop || null };
  }
  if (e === 'controller') {
    if (!/AnimatorController|AnimatorState/.test(text)) return null;
    const states = [...text.matchAll(/AnimatorState:[\s\S]*?m_Name:\s*(.+)/g)].map((m) => m[1].trim());
    return { animType: 'unity-controller', names: uniq(states), label: 'state' };
  }
  if (e === 'plist') {
    if (!/<key>frames<\/key>/.test(text)) return null;
    const frames = [...text.matchAll(/<key>([^<]+\.(?:png|webp|jpe?g))<\/key>/gi)].map((m) => m[1]);
    const tex = text.match(/<key>textureFileName<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    return { animType: 'plist', names: uniq(frames), textures: tex ? [tex] : [], label: 'frame' };
  }
  if (e !== 'json') return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }   // not JSON → not ours to judge here
  if (j && typeof j === 'object') {
    if (j.skeleton && (j.bones || j.animations)) {
      return { animType: 'spine', names: Object.keys(j.animations || {}), skins: Array.isArray(j.skins) ? j.skins.map((s) => s.name) : Object.keys(j.skins || {}),
        bones: (j.bones || []).length, version: j.skeleton.spine || null, label: 'animation' };
    }
    if (j.v && j.fr && Array.isArray(j.layers)) {
      const fps = +j.fr, frames = (+j.op || 0) - (+j.ip || 0);
      return { animType: 'lottie', names: (j.markers || []).map((m) => m.cm).filter(Boolean), fps, frames, duration: fps ? +(frames / fps).toFixed(2) : null,
        w: j.w, h: j.h, label: 'marker' };
    }
    if (j.frames && j.meta) {
      const frames = Array.isArray(j.frames) ? j.frames.map((f) => f.filename) : Object.keys(j.frames);
      return { animType: 'sheet', names: frames, tags: (j.meta.frameTags || []).map((t) => t.name), textures: j.meta.image ? [j.meta.image] : [], label: 'frame' };
    }
    if (Array.isArray(j.armature)) {
      const anims = j.armature.flatMap((a) => (a.animation || []).map((x) => x.name));
      return { animType: 'dragonbones', names: uniq(anims), frameRate: j.frameRate || null, fps: j.frameRate || null, label: 'animation' };
    }
  }
  return null;
}

/** Checks for a replacement animation file against the original. */
export function checkAnim(slot, r, add) {
  const fe = ext(r.name);
  if (fe !== slot.ext) { add('error', 'Sai định dạng', `File .${fe}, game dùng .${slot.ext} — giữ tên ${slot.key}.${slot.ext}`); return; }
  if (!r.animType) { add('error', 'Không đọc được file animation', `Không nhận ra ${animTypeLabel(slot.animType)} — file hỏng hoặc sai định dạng xuất`); return; }
  if (r.animType !== slot.animType) { add('error', 'Sai loại animation', `${animTypeLabel(r.animType)}, game dùng ${animTypeLabel(slot.animType)}`); return; }
  add('ok', 'Loại animation', animTypeLabel(r.animType) + (r.version ? ` · v${r.version}` : ''));
  const what = slot.label || 'tên';
  const missing = (slot.names || []).filter((n) => !(r.names || []).includes(n));
  const extra = (r.names || []).filter((n) => !(slot.names || []).includes(n));
  if (missing.length) {
    const lvl = ['spine', 'dragonbones', 'unity-controller', 'unity-anim', 'sheet', 'plist'].includes(slot.animType) ? 'error' : 'warn';
    add(lvl, `Thiếu ${what} game đang dùng`, `${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` … (+${missing.length - 8})` : ''} — game gọi theo tên này, đổi tên sẽ lỗi`);
  } else if (slot.names?.length) add('ok', `Đủ ${what}`, `${slot.names.length}/${slot.names.length} ${what} giữ nguyên tên`);
  if (extra.length) add('info', `Thêm ${what} mới`, `${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ' …' : ''} — game chỉ dùng nếu code gọi tới`);
  if (slot.fps && r.fps && slot.fps !== r.fps) add('warn', 'Khác fps', `${r.fps} fps (gốc ${slot.fps} fps) — tốc độ phát sẽ khác`);
  if (slot.duration && r.duration && Math.abs(r.duration / slot.duration - 1) > 0.25) add('warn', 'Độ dài khác', `${r.duration}s (gốc ${slot.duration}s) — kiểm tra nếu đồng bộ với âm thanh/gameplay`);
  if (slot.w && r.w && (slot.w !== r.w || slot.h !== r.h)) add('info', 'Khác kích thước khung', `${r.w}×${r.h} (gốc ${slot.w}×${slot.h})`);
  const lostTex = (slot.textures || []).filter((t) => !(r.textures || []).includes(t));
  if (lostTex.length) add('warn', 'Đổi tên texture', `Gốc dùng ${lostTex.join(', ')} — cần gửi kèm ảnh mới đúng tên hoặc giữ tên cũ`);
  if (slot.skins?.length) {
    const lostSkins = slot.skins.filter((s) => !(r.skins || []).includes(s));
    if (lostSkins.length) add('error', 'Thiếu skin', `${lostSkins.join(', ')} — game có thể chọn skin theo tên`);
  }
  if (r.note) add('info', 'Lưu ý', r.note);
}
