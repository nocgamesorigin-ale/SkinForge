// Find the game's screens and popups in its source code and which assets each one uses.
// Web games: HTML containers (<section class="screen">, .panel, #shopPopup…) + every element id inside them,
// then JS/TS/CSS lines that touch those ids and name an asset ("img/ui/deal_${kind}.webp" → deal_*).
// Unity: *.prefab / *.unity named like a panel → sprite GUIDs → image .meta files. Godot: *.tscn → res:// paths.
// Everything is a best guess that Game Design can correct afterwards.
import { ext, stem } from './fsx.js';
import { detectUnity } from './unity.js';

const SRC_EXT = new Set(['html', 'htm', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'vue', 'svelte', 'css', 'scss', 'less', 'json', 'prefab', 'unity', 'tscn']);
const SKIP = new Set(['node_modules', 'dist', 'build', 'out', '.git', '.reskin', '.falcon', '.falcon-publish', 'Library', 'Temp', 'Logs', 'obj', 'coverage', '.idea', '.vscode', 'Packages']);
const MAX_FILE = 1.5 * 1024 * 1024, MAX_FILES = 4000;
const POPUP_WORD = /(panel|popup|pop|modal|dialog|window|sheet|overlay|toast)$/i;
const CONTAINER_ID = /(screen|panel|popup|modal|dialog|page|scene|view|window|sheet|menu|hud)$/i;
const CONTAINER_CLASS = /^(screen|panel|popup|modal|dialog|page|scene|view|window|sheet|hud)$/i;
const UNITY_NAME = /(panel|popup|screen|dialog|window|view|menu|shop|hud|page|scene)/i;

async function walkSource(dir, prefix, out) {
  for await (const [name, h] of dir.entries()) {
    if (out.length >= MAX_FILES) return out;
    if (h.kind === 'directory') {
      if (SKIP.has(name) || name.startsWith('.')) continue;
      await walkSource(h, prefix + name + '/', out);
    } else if (SRC_EXT.has(ext(name)) && !/\.min\.js$|\.d\.ts$/.test(name)) {
      const f = await h.getFile();
      if (f.size <= MAX_FILE) out.push({ path: prefix + name, file: f });
    }
  }
  return out;
}

const humanize = (id) => id.replace(POPUP_WORD, '').replace(/(screen|page|scene|view)$/i, '').replace(/[_\-]+/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2').trim().replace(/^./, (c) => c.toUpperCase()) || id;

/** Asset lookup by file stem, with the folder used to break ties ("img/ui/coin.webp" → ui/coin.webp). */
function assetIndex(slots) {
  const byKey = new Map(), dirs = new Set();
  for (const s of slots) {
    if (!byKey.has(s.key.toLowerCase())) byKey.set(s.key.toLowerCase(), []);
    byKey.get(s.key.toLowerCase()).push(s);
    if (s.dir) dirs.add(s.dir);
  }
  const pick = (list, hint) => {
    const e = ext(hint); if (e) { const x = list.filter((s) => s.ext === e); if (x.length) list = x; }
    if (list.length < 2) return list;
    const m = list.filter((s) => s.dir && hint.includes(s.dir + '/'));
    return m.length ? m : list;
  };
  const distinctive = (k) => /[_\d]/.test(k) || k.length >= 7;
  const dirOf = (hint) => {   // "img/items/" → "items"
    const segs = hint.split('/').filter(Boolean);
    for (let i = segs.length; i > 0; i--) { const d = segs.slice(-i).join('/'); if (dirs.has(d)) return d; }
    return null;
  };
  /** Resolve one string literal. `bare` allows plain words ("coin") when they look like asset names. */
  function resolve(str, bare) {
    const hits = [], dyn = [];
    if (!str || str.length > 400 || str.includes('*')) return { hits, dyn };
    // template literal pieces: "img/ui/deal_${kind}.webp" → prefix deal_ inside ui/
    if (str.includes('${')) {
      const re = /([\w\-./]*)\$\{[^{}]*\}([\w\-.]*)/g; let m;
      while ((m = re.exec(str))) {
        const before = m[1], after = m[2].replace(/^\./, '');
        const slash = before.lastIndexOf('/'), dirHint = before.slice(0, slash + 1), pre = before.slice(slash + 1).toLowerCase();
        const d = dirOf(dirHint);
        if (pre.length >= 2) {
          for (const [k, list] of byKey) if (k.startsWith(pre)) for (const s of list) if ((!d || s.dir === d) && (!after || !ext(after) || s.ext === ext(after) || after.startsWith(s.ext))) hits.push(s);
        } else if (d) dyn.push(d);
      }
      return { hits, dyn };
    }
    for (const tok of str.split(/[\s,;|()'"]+/)) {
      if (!tok) continue;
      if (tok.endsWith('/')) { const d = dirOf(tok); if (d && tok.split('/').length > 2) dyn.push(d); continue; }   // "img/items/" + name
      const last = tok.split('/').pop(), k = stem(last).toLowerCase();
      const strong = tok.includes('/') || last !== k;   // has a folder or an extension
      if (!strong && !(bare === 'any' || (bare && distinctive(k)))) continue;
      const list = byKey.get(k);
      if (list) hits.push(...pick(list, tok));
    }
    return { hits, dyn };
  }
  return { resolve, byKey };
}

/** String literals in a line of JS/TS/CSS ('…', "…", `…`, url(…)). */
function literals(line) {
  const out = [], re = /'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`|url\(\s*([^)'"]+)\s*\)/g;
  let m; while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return out;
}

/** Split JS into top-level statements (brace depth back to 0), keeping line text. */
function topLevelChunks(text) {
  const chunks = []; let depth = 0, start = 0, i = 0, q = null;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (q) { if (c === '\\') { i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && d === '/') { const e = text.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && d === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; i++; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === '\n' && depth === 0) { if (i > start) chunks.push(text.slice(start, i)); start = i + 1; }
    i++;
  }
  if (start < n) chunks.push(text.slice(start));
  return chunks;
}

export async function detectScreens(root, slots, assetRoot = '', onProgress) {
  const files = await walkSource(root, '', []);
  const { resolve } = assetIndex(slots);
  // "img/items/" + name means "any item": only folders made mostly of image sets count as picked at runtime
  const perDir = new Map();
  for (const s of slots) { const r = perDir.get(s.dir) || perDir.set(s.dir, [0, 0]).get(s.dir); r[0]++; if (s.set) r[1]++; }
  const dynOk = (d) => { const r = perDir.get(d); return !!r && r[1] >= r[0] / 2; };
  const screens = new Map();   // key → { key, kind, name, file, slots:Set, dyn:Set, order }
  const idMap = new Map();     // element id → screen key
  const add = (key, list, dyn) => { const sc = screens.get(key); if (!sc) return; for (const s of list) sc.slots.add(s.id); for (const d of dyn) if (dynOk(d)) sc.dyn.add(d); };
  let order = 0;

  // 1) HTML containers
  const html = files.filter((f) => /\.(html?|vue|svelte)$/i.test(f.path));
  for (const f of html) {
    const text = await f.file.text();
    const src = /\.(vue|svelte)$/i.test(f.path) ? (text.match(/<template[^>]*>([\s\S]*)<\/template>/i)?.[1] || text) : text;
    const doc = new DOMParser().parseFromString(src, 'text/html');
    const isContainer = (el) => el.id && el !== doc.body && (
      ['SECTION', 'DIALOG'].includes(el.tagName) || CONTAINER_ID.test(el.id) || [...el.classList].some((c) => CONTAINER_CLASS.test(c)));
    const containers = [...doc.body.querySelectorAll('[id]')].filter(isContainer);
    for (const el of containers) {
      const popup = el.tagName === 'DIALOG' || POPUP_WORD.test(el.id) || [...el.classList].some((c) => POPUP_WORD.test(c));
      const titleEl = [...el.querySelectorAll('.ptitle, .title, h1, h2, h3, [class*="title"]')].find((t) => t.textContent.trim() && t.textContent.trim().length <= 32);
      const titleImg = el.querySelector('img.banner[alt], img[class*="title"][alt]');
      const title = titleEl?.textContent.trim().replace(/\s+/g, ' ') || titleImg?.getAttribute('alt')?.trim() || humanize(el.id);
      const key = `${stem(f.path.split('/').pop())}#${el.id}`;
      screens.set(key, { key, kind: popup ? 'popup' : 'screen', name: `${popup ? 'Popup' : 'Màn'} ${title}`, file: f.path, id: el.id, slots: new Set(), dyn: new Set(), order: order++ });
    }
    // innermost container owns each element / attribute
    const owner = (el) => { for (let e = el; e && e !== doc.body; e = e.parentElement) if (isContainer(e)) return `${stem(f.path.split('/').pop())}#${e.id}`; return null; };
    for (const el of doc.body.querySelectorAll('*')) {
      const key = owner(el); if (!key) continue;
      if (el.id) idMap.set(el.id, key);
      for (const a of el.attributes) {
        if (a.name === 'id' || a.name === 'class') continue;
        const v = a.value; if (!v) continue;
        const r = /^(src|data-src|href|srcset|poster|style|xlink:href)$/.test(a.name) || /[/.]/.test(v) ? resolve(v, false) : { hits: [], dyn: [] };
        if (a.name === 'style') for (const u of literals(v)) { const x = resolve(u, false); r.hits.push(...x.hits); }
        add(key, r.hits, r.dyn);
      }
    }
  }

  // 1b) game data (data.json…): top-level key → assets named inside it ({"tiers":[{"bg":"bg2"}]} → tiers: bg2)
  const IMG_FIELD = /^(bg|background|icon|img|image|sprite|texture|src|frame|pic|art|avatar|banner|thumb|cover)s?$/i;
  const dataKeys = new Map();
  const dataTopics = [];   // levels / rooms / items listed in game data, one topic per entry
  for (const f of files.filter((x) => /\.json$/i.test(x.path) && !/(package|tsconfig|capacitor|manifest|lock)/i.test(x.path))) {
    let data; try { data = JSON.parse(await f.file.text()); } catch { continue; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    for (const [top, val] of Object.entries(data)) {
      const found = new Set();
      const visit = (v, field) => {
        if (typeof v === 'string') {
          for (const s of resolve(v, IMG_FIELD.test(field || '') ? 'any' : false).hits) if (!dynOk(s.dir) && !/^(mp3|ogg|wav|m4a|aac)$/.test(s.ext)) found.add(s);
        } else if (Array.isArray(v)) v.forEach((x) => visit(x, field));
        else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
      };
      visit(val, top);
      if (found.size && found.size <= 40) dataKeys.set(top, [...found]);
      const type = topicType(top);
      if (type && Array.isArray(val) && val.length >= 2 && val.length <= 500) {
        const label = TOPIC_LABEL[type];
        val.forEach((entry, i) => {
          if (!entry || typeof entry !== 'object') return;
          const hits = new Set();
          const v2 = (v, field) => {
            if (typeof v === 'string') { for (const s of resolve(v, IMG_FIELD.test(field || '') ? 'any' : false).hits) hits.add(s); }
            else if (Array.isArray(v)) v.forEach((x) => v2(x, field));
            else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) v2(x, k);
          };
          v2(entry, top);
          if (!hits.size) return;
          const title = typeof entry.name === 'string' ? entry.name : typeof entry.title === 'string' ? entry.title : typeof entry.id === 'string' ? entry.id : '';
          dataTopics.push({ key: `${f.path}:${top}#${i}`, id: `${top}_${i + 1}`, kind: type, n: i + 1, name: `${label} ${i + 1}${title ? ' · ' + title : ''}`, file: f.path, slots: new Set([...hits].map((s) => s.id)), dyn: new Set(), order: i });
        });
      }
    }
  }
  const dataRe = dataKeys.size ? new RegExp(`\\.(${[...dataKeys.keys()].map((k) => k.replace(/[^\w$]/g, '')).filter(Boolean).join('|')})\\b`, 'g') : null;

  // 2) JS / TS / CSS lines that touch those ids
  // an element id counts when written as a selector (#id), in getElementById / a call ("clean" in screen("clean")),
  // or quoted when it cannot be an ordinary word ("salePanel"); a plain "splash" in a list of effect names does not
  const ids = [...idMap.keys()].map((k) => k.replace(/[.*+?^${}()|[\]\\\-:]/g, '\\$&'));
  const odd = ids.filter((k) => /[A-Z\d_\\]/.test(k));
  const idRe = idMap.size ? new RegExp(`(?:#|getElementById\\(\\s*['"\`]|\\w\\(\\s*['"\`])(${ids.join('|')})(?![\\w-])${odd.length ? `|['"\`](${odd.join('|')})['"\`]` : ''}`, 'g') : null;
  const unassigned = new Set();
  for (const f of files.filter((x) => /\.(m?js|cjs|tsx?|jsx|vue|svelte|s?css|less)$/i.test(x.path))) {
    const text = await f.file.text();
    const css = /\.(s?css|less)$/i.test(f.path);
    for (const chunk of css ? text.split('}') : topLevelChunks(text)) {
      const lines = chunk.split('\n');
      const lineIds = lines.map((l) => idRe ? [...new Set([...l.matchAll(idRe)].map((m) => idMap.get(m[1] || m[2])))] : []);
      // the screen this statement talks about most is the fallback for lines that name no element
      const tally = new Map(); lineIds.flat().forEach((k) => tally.set(k, (tally.get(k) || 0) + 1));
      const main = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const cssKeys = css ? [...new Set([...chunk.matchAll(/#([\w-]+)/g)].map((m) => idMap.get(m[1])).filter(Boolean))] : [];
      lines.forEach((line, i) => {
        const hits = [], dyn = [];
        for (const lit of literals(line)) { const r = resolve(lit, !css); hits.push(...r.hits); dyn.push(...r.dyn); }
        // nested / multi-line template literals (`<img src="${U(`img/ui/pu_${type}.webp`)}">`) are not split cleanly: read the raw line too
        if (!css && line.includes('${')) { const r = resolve(line.replace(/[`'"]/g, ' '), false); hits.push(...r.hits); dyn.push(...r.dyn); }
        if (dataRe && !css) for (const m of line.matchAll(dataRe)) hits.push(...(dataKeys.get(m[1]) || []));
        if (!hits.length && !dyn.length) return;
        const keys = css ? cssKeys : lineIds[i].length ? lineIds[i] : main ? [main] : [];
        if (!keys.length) { hits.forEach((s) => unassigned.add(s.id)); return; }
        for (const k of keys) add(k, hits, dyn);
      });
    }
  }

  // 3) Unity: follow GUID references from level / room prefabs, scenes and panels through sprites, materials,
  //    Spine data and enum-picked files (see unity.js)
  let unityTopics = [];
  let isUnity = false; try { await root.getDirectoryHandle('ProjectSettings'); isUnity = true; } catch {}
  if (isUnity) {
    unityTopics = (await detectUnity(root, slots, assetRoot, onProgress)).topics;
    for (const t of unityTopics) screens.set(t.key, t);
  }

  // 4) Godot scenes: ext_resource paths
  for (const f of files.filter((x) => /\.tscn$/i.test(x.path))) {
    const nm = stem(f.path.split('/').pop());
    const hits = []; for (const m of (await f.file.text()).matchAll(/path="res:\/\/([^"]+)"/g)) hits.push(...resolve(m[1], false).hits);
    if (!hits.length) continue;
    screens.set(f.path, { key: f.path, kind: POPUP_WORD.test(nm) ? 'popup' : 'screen', name: `${POPUP_WORD.test(nm) ? 'Popup' : 'Màn'} ${humanize(nm)}`, file: f.path, id: nm, slots: new Set(hits.map((s) => s.id)), dyn: new Set(), order: order++ });
  }

  // 5) rooms / levels from folder and file names (rooms/room_2/…, lv3_bg.png, room_1.webp) and from game data
  const named = new Map();
  for (const s of slots) {
    const m = s.id.replace(/\.[^.]+$/, '').match(NAME_TOPIC); if (!m) continue;
    const type = topicType(m[1]), n = +m[2], k = `${type}:${n}`;
    if (!named.has(k)) named.set(k, { type, n, slots: new Set() });
    named.get(k).slots.add(s.id);
  }
  const perType = new Map(); for (const t of named.values()) perType.set(t.type, (perType.get(t.type) || 0) + 1);
  for (const t of named.values()) {
    if (perType.get(t.type) < 2) continue;   // one "stage_1" alone is just a file name
    // Unity: "lv26_bg.png" belongs to the level prefab 26.prefab (its play order may differ)
    const u = unityTopics.find((x) => x.kind === t.type && x.prefabId === t.n && !x.suffix);
    if (u) { t.slots.forEach((id) => u.slots.add(id)); continue; }
    if (unityTopics.some((x) => x.kind === t.type)) continue;   // levels come from prefabs: a name-only topic would be a duplicate
    // "room_2.webp" + the 2nd entry of data "tiers"/"rooms" are the same room
    const d = dataTopics.find((x) => x.kind === t.type && x.n === t.n);
    if (d) { t.slots.forEach((id) => d.slots.add(id)); continue; }
    const key = `name:${t.type}${t.n}`;
    screens.set(key, { key, kind: t.type, name: `${TOPIC_LABEL[t.type]} ${t.n}`, file: 'tên file / thư mục', id: `${t.type}_${t.n}`, slots: t.slots, dyn: new Set(), order: 1000 + t.n });
  }
  for (const d of dataTopics) screens.set(d.key, d);

  const rank = { screen: 0, popup: 1, room: 2, level: 3, item: 4 };
  const out = [...screens.values()].filter((s) => s.slots.size || s.dyn.size)
    .sort((a, b) => (a.kind === b.kind ? a.order - b.order : (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9)))
    .map((s) => ({ key: s.key, id: s.id, kind: s.kind, name: s.name, file: s.file, slots: [...s.slots], dyn: [...s.dyn] }));
  const used = new Set(out.flatMap((s) => s.slots));
  return { screens: out, unassigned: [...unassigned].filter((id) => !used.has(id)), scanned: files.length };
}

/** Topic kinds besides screens / popups. "items" counts as its own kind (in some games each item is a level). */
export const TOPIC_LABEL = { room: 'Room', level: 'Level', item: 'Item' };
function topicType(word) {
  const w = word.toLowerCase().replace(/s$/, '');
  if (/^(level|lvl|lv|stage|round|puzzle)$/.test(w)) return 'level';
  if (/^(room|chapter|world|area|map|zone|tier|house|floor|scene)$/.test(w)) return 'room';
  if (/^(item|object|product)$/.test(w)) return 'item';
  return null;
}
const NAME_TOPIC = /(?:^|[\/_\-\s])(rooms?|levels?|lvl|lv|stages?|chapters?|worlds?|areas?|maps?|zones?|floors?)[\s_\-]?0*(\d{1,3})(?=$|[\/_\-\s.])/i;

async function getRel(root, path) {
  const parts = path.split('/'); const name = parts.pop(); let d = root;
  for (const p of parts.filter(Boolean)) d = await d.getDirectoryHandle(p);
  return (await d.getFileHandle(name)).getFile();
}
