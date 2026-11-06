import './style.css';
import * as F from './fsx.js';
import { render, toPNG, fmtBytes, placement } from './imaging.js';
import { RULES, SAFE, buildSlots, findSets, defaultGroups, matcher, makeReskin, checkAll, autoFit, summary } from './project.js';
import { makeZip, readZip, download } from './zipx.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ICON = {
  logo: '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" rx="7" fill="var(--accent)"/><path d="M9 18l4-8 3 5 2-3 2 6" stroke="#fff" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  folder: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v6M9 14h6"/></svg>',
  zip: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="2" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  upload: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/></svg>',
};
const STATUS = {
  ok: { label: 'Đạt', cls: 'ok' }, warn: { label: 'Cảnh báo', cls: 'warn' }, error: { label: 'Lỗi', cls: 'error' }, missing: { label: 'Chưa có', cls: 'none' },
};

// mode: 'gd' (Game Design: owns the game folders) | 'artist' (opens brief packs only) | null (not chosen yet)
const app = { screen: 'home', mode: F.pref.get('mode'), project: null, filter: 'all', group: null, search: '', recent: [], jobs: [], detail: null, safe: true };
const urls = new Map();   // slot id → object URL of the original
const thumbUrls = new Map();   // job id → [object URLs]
const root = $('#app');
document.documentElement.dataset.mode = app.mode || '';

/* ---------------- rendering ---------------- */
function draw() {
  root.innerHTML = app.screen !== 'home' ? workspaceView() : !app.mode ? modePickerView() : app.mode === 'gd' ? homeGDView() : homeArtistView();
  if (app.detail) root.insertAdjacentHTML('beforeend', detailView());
  if (app.apply) root.insertAdjacentHTML('beforeend', applyView());
}
function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
}
function busy(msg, done, total) {
  let b = $('#busy');
  if (!msg) { b?.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'busy'; document.body.appendChild(b); }
  const pct = total ? Math.round((done / total) * 100) : null;
  b.innerHTML = `<div class="busy-card" role="status"><b>${esc(msg)}</b>${pct !== null ? `<div class="bar"><i style="width:${pct}%"></i></div><span>${done} / ${total}</span>` : '<div class="spinner"></div>'}</div>`;
}

const MODE_ICON = {
  gd: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  artist: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 3l3 3-9.5 9.5-4 1 1-4z"/><path d="M7.5 16.5c-2 0-3.5 1.5-3.5 4 2.5 0 4-1.5 4-3.5"/></svg>',
};
function header(extra = '') {
  const sw = app.screen === 'home' && app.mode ? `<div class="modesw" role="group" aria-label="Chế độ">
      <button class="${app.mode === 'gd' ? 'on' : ''}" data-act="set-mode" data-mode="gd" ${app.mode === 'gd' ? 'aria-current="page"' : ''}>${MODE_ICON.gd}Game Design</button>
      <button class="${app.mode === 'artist' ? 'on artist' : ''}" data-act="set-mode" data-mode="artist" ${app.mode === 'artist' ? 'aria-current="page"' : ''}>${MODE_ICON.artist}Artist</button>
    </div>` : '';
  return `<header class="top">
    <div class="brand">${ICON.logo}<span>SkinForge</span>${app.screen !== 'home' && app.project?.kind === 'brief' ? '<span class="pill pink">Chế độ Artist</span>' : ''}</div>
    ${sw}${extra}
    <span class="safe">${ICON.shield} ${app.mode === 'artist' ? 'Không cần cài game · chạy trên mọi trình duyệt' : 'Ảnh không rời khỏi máy bạn'}</span>
  </header>`;
}

const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : new Date(t).toLocaleDateString('vi-VN');
};

function modePickerView() {
  const item = (t) => `<li><span aria-hidden="true">✓</span>${t}</li>`;
  return `<header class="top bare"><div class="brand">${ICON.logo}<span>SkinForge</span></div><span class="safe">${ICON.shield} Ảnh không rời khỏi máy bạn</span></header>
  <main class="picker">
    <div class="picker-h"><h1>Bạn làm việc với vai trò nào?</h1>
      <p>Mỗi vai trò có một trang chủ riêng, chỉ hiện đúng những việc bạn cần. Đổi lại bất cứ lúc nào ở góc trên.</p></div>
    <div class="picker-cards">
      <button class="role gd" data-act="pick-mode" data-mode="gd">
        <span class="role-top"><span class="role-ic">${ICON.folder}</span><span class="pill">Cần Chrome / Edge</span></span>
        <b>Game Design</b><span class="muted">Người giữ thư mục dự án game.</span>
        <ul>${item('Thêm thư mục dự án, quét toàn bộ asset')}${item('Đặt quy tắc từng nhóm, xuất brief cho artist')}${item('Nhận gói reskin, kiểm tra, áp dụng vào game')}${item('Sao lưu, hoàn tác, báo cáo dung lượng')}</ul>
        <span class="role-cta">Vào chế độ Game Design</span>
      </button>
      <button class="role artist" data-act="pick-mode" data-mode="artist">
        <span class="role-top"><span class="role-ic">${MODE_ICON.artist}</span><span class="pill gray">Mọi trình duyệt</span></span>
        <b>Artist</b><span class="muted">Người vẽ lại art theo gói brief được giao.</span>
        <ul>${item('Mở gói brief / reskin được gửi')}${item('Chọn project đang làm để tiếp tục')}${item('Kéo thả ảnh đã vẽ, tự kiểm tra lỗi')}${item('Xuất gói reskin gửi lại Game Design')}</ul>
        <span class="role-cta">Vào chế độ Artist</span>
      </button>
    </div>
    <label class="check"><input type="checkbox" id="rememberMode" checked> Nhớ lựa chọn trên máy này — lần sau vào thẳng trang chủ của vai trò</label>
  </main>`;
}

function projectState(r) {
  if (r.reskinAt && (!r.appliedAt || r.reskinAt > r.appliedAt)) return ['Có gói reskin mới', 'ok'];
  if (r.appliedAt) return ['Đã áp dụng vào game', 'info'];
  if (r.briefAt) return ['Đã gửi brief · chờ artist', 'warn'];
  return ['Chưa gửi brief', 'none'];
}

function homeGDView() {
  const log = F.pref.get('log', []);
  const cards = app.recent.map((r) => {
    const [state, cls] = projectState(r);
    const pct = r.assets ? Math.round(((r.done || 0) / r.assets) * 100) : 0;
    return `<article class="pcard">
      <div class="pcard-top"><span class="pill">${esc(r.engine)}</span><span class="badge ${cls}">${state}</span></div>
      <div class="pcard-title"><b>${esc(r.name)}</b><span class="muted small">${ago(r.opened)}</span></div>
      <code>${esc(r.path || r.name)}</code>
      <div class="pstats"><div><small>Asset</small><b>${r.assets ?? '—'}</b></div><div><small>Đã reskin</small><b>${r.done ?? 0}</b></div><div><small>Ảnh gốc</small><b>${r.bytes ? fmtBytes(r.bytes) : '—'}</b></div></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <span class="muted small">${esc(r.activity || 'Chưa có hoạt động')}</span>
      <div class="row">
        <button class="btn primary grow" data-act="open-recent" data-id="${esc(r.id)}">Mở workspace</button>
        <button class="btn grow" data-act="recent-brief" data-id="${esc(r.id)}">Xuất brief</button>
        <button class="iconbtn" data-act="forget" data-id="${esc(r.id)}" aria-label="Xoá ${esc(r.name)} khỏi danh sách" title="Xoá khỏi danh sách">${ICON.close}</button>
      </div>
    </article>`;
  }).join('');
  return `${header()}
  <main class="home">
    <section class="hero">
      <div><h1>Dự án game của tôi</h1>
        <p>Thêm thư mục dự án để quét asset. Mỗi dự án theo dõi brief đã gửi và các gói reskin artist gửi về.</p></div>
      <button class="btn primary big" data-act="open-folder" ${F.fsSupported ? '' : 'disabled'}>${ICON.folder} Thêm thư mục dự án</button>
    </section>
    ${F.fsSupported ? '' : '<div class="notice warn">Trình duyệt này không cho ghi thẳng vào thư mục. Chế độ Game Design cần Chrome hoặc Edge.</div>'}
    <section class="inbox">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/></svg>
      <div class="grow"><b>Nhận gói reskin từ artist</b><span>Kéo thả file <b>*_reskin.zip</b> vào đây — SkinForge tự nhận ra thuộc dự án nào và mở workspace để kiểm tra.</span></div>
      <label class="btn">Chọn file zip<input type="file" accept=".zip" data-act="open-zip" hidden></label>
    </section>
    <section class="grid-projects">${cards || '<div class="empty">Chưa có dự án nào. Bấm “Thêm thư mục dự án” và chọn thư mục gốc của game.</div>'}</section>
    ${log.length ? `<section class="activity"><div class="activity-h"><b>Hoạt động gần đây</b><span class="muted small">Lưu trong trình duyệt này</span></div>
      ${log.slice(0, 8).map((l) => `<div class="act"><i class="${l.kind}"></i><span class="grow">${esc(l.text)}</span><span class="muted small">${ago(l.t)}</span></div>`).join('')}</section>` : ''}
  </main>`;
}

function jobState(j) {
  if (!j.done) return ['Mới nhận', 'info'];
  if (j.exportedAt && j.exportedAt >= (j.updatedAt || 0)) return ['Đã gửi', 'ok'];
  return ['Đang làm', 'pink'];
}

function homeArtistView() {
  const jobs = app.jobs.map((j) => {
    const [state, cls] = jobState(j);
    const pct = j.total ? Math.round(((j.done || 0) / j.total) * 100) : 0;
    const th = thumbUrls.get(j.id) || [];
    return `<article class="job">
      <div class="job-th">${th.map((u) => `<span class="checker"><img src="${u}" alt=""></span>`).join('')}</div>
      <div class="job-main">
        <div class="row"><b>${esc(j.name)}</b><span class="badge ${cls}">${state}</span></div>
        <span class="muted small">${esc(j.briefName)} · nhận ${ago(j.received)} · ${j.total} ô asset${j.errors ? ` · ${j.errors} ảnh cần sửa` : ''}</span>
        <div class="row"><div class="bar pink grow"><i style="width:${pct}%"></i></div><span class="small"><b>${j.done || 0} / ${j.total}</b></span></div>
      </div>
      <div class="row">
        <button class="btn artist-primary" data-act="open-job" data-id="${esc(j.id)}">Tiếp tục</button>
        <button class="btn" data-act="export-job" data-id="${esc(j.id)}" ${j.done ? '' : 'disabled'}>${j.exportedAt && j.exportedAt >= (j.updatedAt || 0) ? 'Xuất lại' : `Xuất gói reskin${j.done ? ` (${j.done})` : ''}`}</button>
        <button class="iconbtn" data-act="forget-job" data-id="${esc(j.id)}" aria-label="Xoá ${esc(j.name)} khỏi danh sách" title="Xoá khỏi danh sách">${ICON.close}</button>
      </div>
    </article>`;
  }).join('');
  return `${header()}
  <main class="home narrow">
    <section><h1>Việc reskin của tôi</h1><p class="muted">Mở gói brief Game Design gửi cho bạn, hoặc chọn một project đang làm để tiếp tục.</p></section>
    <label class="opener">
      <span class="opener-ic"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></span>
      <b>Mở gói (brief / reskin)</b>
      <span>Kéo thả file <b>*_brief.zip</b> hoặc <b>*_reskin.zip</b> vào đây</span>
      <span class="btn artist-primary">Chọn file zip</span>
      <small>Gói chỉ được đọc trong trình duyệt của bạn — không tải lên đâu cả</small>
      <input type="file" accept=".zip" data-act="open-zip" hidden>
    </label>
    <section class="jobs">
      <div class="jobs-h"><h2>Project đang làm</h2><span class="muted small">Lưu trên trình duyệt này · ảnh bạn đã kéo vào được giữ lại</span></div>
      ${jobs || '<div class="empty">Chưa có project nào. Mở gói brief Game Design gửi cho bạn để bắt đầu.</div>'}
    </section>
    <section class="steps">
      <div><b>Giữ đúng tên file</b><span>Tool tự khớp ảnh theo tên.</span></div>
      <div><b>PNG nền trong suốt</b><span>Cho đồ vật, icon, nút.</span></div>
      <div><b>Đồ vật: dáng tự do</b><span>Nhưng các ảnh trong một bộ phải khớp nhau.</span></div>
      <div><b>Nút, banner, nền</b><span>Giữ tỉ lệ khung như ảnh gốc.</span></div>
    </section>
  </main>`;
}

/* cards = sets + loose slots, filtered */
function cardsOf(p) {
  const cards = [];
  const seen = new Set();
  for (const s of p.slots) {
    if (app.group && s.group !== app.group) continue;
    if (s.set) {
      if (seen.has(s.set)) continue; seen.add(s.set);
      cards.push({ type: 'set', id: s.set, set: p.sets[s.set], slots: p.sets[s.set].members.map((id) => p.slotById.get(id)) });
    } else cards.push({ type: 'slot', id: s.id, slots: [s] });
  }
  for (const c of cards) {
    const st = c.slots.map((s) => p.reskins.get(s.id)?.status || 'missing');
    c.status = st.includes('error') ? 'error' : st.includes('warn') ? 'warn' : st.every((x) => x === 'missing') ? 'missing' : st.includes('missing') ? 'warn' : 'ok';
    c.dots = st;
  }
  const q = app.search.trim().toLowerCase();
  return cards.filter((c) => (app.filter === 'all' || c.status === app.filter) && (!q || c.id.toLowerCase().includes(q)));
}

function cardNote(p, c) {
  const errs = c.slots.flatMap((s) => (p.reskins.get(s.id)?.checks || []).filter((k) => k.level === 'error' || k.level === 'warn').map((k) => k.title));
  if (c.status === 'missing') return c.type === 'set' ? `Cần ${c.slots.length} ảnh: ${c.slots[0].key} … ${c.slots.at(-1).key}` : `Cần ${c.slots[0].name}`;
  return errs[0] ? errs[0] + (errs.length > 1 ? ` (+${errs.length - 1})` : '') : `${c.slots.length}/${c.slots.length} ảnh đạt`;
}

function workspaceView() {
  const p = app.project, sm = summary(p), groups = Object.values(p.groups);
  const cards = cardsOf(p);
  const rep = c => c.slots[c.slots.length - 1];
  const readyCount = [...p.reskins.values()].filter((r) => r.status !== 'error').length;
  const extra = `<a class="iconbtn" href="#" data-act="home" aria-label="Về danh sách project">${ICON.back}</a>
    <div class="ptitle"><div><b>${esc(p.name)}</b><span class="pill">${esc(p.engine)}</span></div><code>${esc(p.kind === 'brief' ? p.briefName : (p.root.name + (p.assetRoot ? '/' + p.assetRoot : '')))}</code></div>
    <div class="row right">
      ${p.kind === 'folder' ? `<button class="btn" data-act="export-brief">Xuất brief cho artist</button>
        <label class="btn">Nhập gói reskin<input type="file" accept=".zip,image/*" multiple data-act="import-files" hidden></label>
        <button class="btn primary" data-act="open-apply" ${readyCount ? '' : 'disabled'}>Áp dụng vào game (${readyCount})</button>`
      : `<label class="btn">Chọn ảnh<input type="file" accept="image/*" multiple data-act="import-files" hidden></label>
        <button class="btn primary" data-act="export-reskin" ${p.reskins.size ? '' : 'disabled'}>Xuất gói reskin (${p.reskins.size})</button>`}
    </div>`;
  return `${header(extra)}
  <div class="statbar">
    <span class="stat"><i style="background:var(--muted)"></i>Tổng <b>${sm.total}</b></span>
    <span class="stat ok"><i></i>Đạt <b>${sm.ok}</b></span>
    <span class="stat warn"><i></i>Cảnh báo <b>${sm.warn}</b></span>
    <span class="stat error"><i></i>Lỗi <b>${sm.error}</b></span>
    <span class="stat"><i style="background:#D1D5DB"></i>Chưa có <b>${sm.missing}</b></span>
    <span class="statbar-size">Ảnh gốc: <b>${fmtBytes(p.slots.reduce((a, s) => a + s.bytes, 0))}</b> · ${p.slots.length} file</span>
  </div>
  <div class="ws">
    <aside class="side">
      <span class="label">NHÓM ASSET</span>
      <button class="gbtn ${!app.group ? 'on' : ''}" data-act="group" data-g=""><span>Tất cả</span><span class="muted small">${p.slots.length}</span></button>
      ${groups.map((g) => `<div class="gitem ${app.group === g.name ? 'on' : ''}">
        <button class="gbtn" data-act="group" data-g="${esc(g.name)}"><span><span>${esc(g.name)}</span><small class="rule ${g.rule}">${RULES[g.rule].label}${g.sets ? ` · ${g.sets} bộ` : ''}</small></span><span class="muted small">${g.count}</span></button>
        ${p.kind === 'folder' ? `<button class="link small" data-act="toggle-rule" data-g="${esc(g.name)}">Đổi thành “${RULES[g.rule === 'free' ? 'fixed' : 'free'].label}”</button>` : ''}
      </div>`).join('')}
      <div class="hintbox"><b>Quy tắc</b><br><b>Khung tự do:</b> ${RULES.free.hint} Ảnh trong một bộ phải khớp nhau, không cần khớp ảnh gốc.<br><b>Giữ tỉ lệ khung:</b> ${RULES.fixed.hint}</div>
    </aside>
    <main class="main">
      <div class="toolbar">
        <label class="search">${'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'}<span class="sr">Tìm asset</span><input type="search" data-act="search" placeholder="Tìm theo tên file, ví dụ bag_1" value="${esc(app.search)}"></label>
        <div class="seg" role="group" aria-label="Lọc theo trạng thái">
          ${[['all', 'Tất cả'], ['missing', 'Chưa có'], ['error', 'Lỗi'], ['warn', 'Cảnh báo'], ['ok', 'Đạt']].map(([k, l]) => `<button class="${app.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l}</button>`).join('')}
        </div>
        <span class="muted small grow">Kéo thả ảnh, thư mục hoặc file zip vào đây — tự khớp theo tên file</span>
      </div>
      <div class="cards">
        ${cards.slice(0, app.limit || 120).map((c) => {
          const s = rep(c), r = p.reskins.get(s.id);
          return `<button class="card ${STATUS[c.status].cls}" data-act="detail" data-id="${esc(c.id)}">
            <div class="card-h"><div><b class="mono">${esc(c.type === 'set' ? c.set.name : s.key)}</b><span class="muted small">${esc(s.dir || '(gốc)')} · ${s.w}×${s.h}${c.type === 'set' ? ` · bộ ${c.slots.length} ảnh` : ''}</span></div><span class="badge ${STATUS[c.status].cls}">${STATUS[c.status].label}</span></div>
            <div class="pair">
              <figure><figcaption>GỐC</figcaption><div class="thumb checker"><img src="${origUrl(s)}" alt="" loading="lazy"></div></figure>
              <figure><figcaption>RESKIN</figcaption>${r?.preview ? `<div class="thumb checker"><img src="${r.preview}" alt=""></div>` : `<div class="thumb drop">${ICON.upload}<span>Kéo thả ${c.slots.length > 1 ? c.slots.length + ' ảnh' : 'ảnh'}</span></div>`}</figure>
            </div>
            ${c.type === 'set' ? `<div class="dots">${c.dots.map((d) => `<i class="${STATUS[d].cls}"></i>`).join('')}</div>` : ''}
            <span class="note ${STATUS[c.status].cls}">${esc(cardNote(p, c))}</span>
          </button>`;
        }).join('') || '<div class="empty">Không có asset nào khớp bộ lọc.</div>'}
      </div>
      ${cards.length > (app.limit || 120) ? `<button class="btn center" data-act="more">Hiện thêm (${cards.length - (app.limit || 120)})</button>` : ''}
    </main>
  </div>
  <div class="dropveil" aria-hidden="true"><div>${ICON.upload}<b>Thả để nhập ảnh reskin</b><span>Ảnh, thư mục hoặc zip — khớp theo tên file</span></div></div>`;
}

function origUrl(s) {
  if (!urls.has(s.id)) { const b = app.project.files.get(s.id); urls.set(s.id, b ? URL.createObjectURL(b) : ''); }
  return urls.get(s.id);
}

function detailView() {
  const p = app.project, d = app.detail;
  const slots = d.type === 'set' ? p.sets[d.id].members.map((id) => p.slotById.get(id)) : [p.slotById.get(d.id)];
  const s0 = slots[0], rule = p.groups[s0.group].rule;
  const fitKey = s0.set || s0.id, fit = p.fits[fitKey];
  const cols = `grid-template-columns: 130px repeat(${slots.length}, minmax(0, 1fr))`;
  const checks = slots.flatMap((s) => (p.reskins.get(s.id)?.checks || []).map((k) => ({ ...k, who: slots.length > 1 ? s.key : '' })));
  const order = { error: 0, warn: 1, info: 2, ok: 3 };
  const shown = checks.filter((k, i, a) => k.level !== 'ok' || a.findIndex((x) => x.title === k.title) === i).sort((a, b) => order[a.level] - order[b.level]);
  const hasAny = slots.some((s) => p.reskins.get(s.id));
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Chi tiết ${esc(d.id)}">
    <div class="sheet wide">
      <header class="sheet-h">
        <div><b class="mono">${esc(d.type === 'set' ? p.sets[d.id].name : s0.key)}</b> <span class="muted">${esc(s0.dir || '(gốc)')} · ${slots.length > 1 ? `bộ ${slots.length} ảnh` : '1 ảnh'} · ${s0.w}×${s0.h} ${s0.ext}</span> <span class="pill ${rule}">${RULES[rule].label}</span></div>
        <button class="iconbtn" data-act="close-detail" aria-label="Đóng">${ICON.close}</button>
      </header>
      <div class="detail">
        <div class="dmain">
          <div class="dgrid" style="${cols}">
            <span></span>${slots.map((s) => `<span class="mono small center">${esc(s.key)}</span>`).join('')}
            <div class="rowlabel"><b>Gốc</b><span class="muted small">${s0.w}×${s0.h}${s0.alpha ? ' · trong suốt' : ''}</span></div>
            ${slots.map((s) => `<div class="cell checker" style="aspect-ratio:${s.w}/${s.h}"><img src="${origUrl(s)}" alt="Gốc ${esc(s.key)}"></div>`).join('')}
            <div class="rowlabel"><b>Reskin</b><span class="muted small">${hasAny ? 'Đã khớp vào khung gốc' : 'Chưa có'}</span></div>
            ${slots.map((s) => {
              const r = p.reskins.get(s.id);
              const box = r && app.safe && rule === 'free' ? `<i class="safe-zone" style="inset:${((1 - SAFE.max) / 2) * 100}%"></i>` : '';
              return r ? `<div class="cell checker ${r.status}" style="aspect-ratio:${s.w}/${s.h}"><img src="${r.preview}" alt="Reskin ${esc(s.key)}">${box}</div>`
                : `<label class="cell drop" style="aspect-ratio:${s.w}/${s.h}">${ICON.upload}<span>Chọn ảnh</span><input type="file" accept="image/*" data-act="pick-one" data-id="${esc(s.id)}" hidden></label>`;
            }).join('')}
          </div>
          <div class="dtools">
            ${rule === 'free' ? `<label class="check"><input type="checkbox" data-act="toggle-safe" ${app.safe ? 'checked' : ''}> Hiện vùng an toàn (món đồ nên chiếm ${SAFE.min * 100}–${SAFE.max * 100}% khung)</label>` : ''}
            <span class="grow"></span>
            ${rule === 'free' && hasAny ? (fit ? `<button class="btn" data-act="unfit" data-k="${esc(fitKey)}">Bỏ tự căn</button>` : `<button class="btn primary" data-act="autofit" data-k="${esc(fitKey)}">Tự cắt &amp; căn vào vùng an toàn${slots.length > 1 ? ` (cả ${slots.length} ảnh)` : ''}</button>`) : ''}
          </div>
        </div>
        <aside class="dside">
          <div class="panel"><b>Kiểm tra tự động</b>
            ${shown.length ? shown.map((k) => `<div class="chk ${k.level}"><i aria-hidden="true">${{ ok: '✓', info: 'i', warn: '!', error: '✗' }[k.level]}</i><div><b>${esc(k.title)}${k.who ? ` · ${esc(k.who)}` : ''}</b><span>${esc(k.detail)}</span></div></div>`).join('') : '<span class="muted small">Chưa có ảnh reskin cho ô này.</span>'}
          </div>
          <div class="panel"><b>Yêu cầu của ô này</b>
            <dl><dt>Tên file</dt><dd class="mono">${esc(slots.length > 1 ? `${slots[0].key} … ${slots.at(-1).key}` : s0.key)}</dd>
            <dt>Quy tắc</dt><dd>${RULES[rule].label}</dd>
            <dt>Khung</dt><dd>${s0.w} × ${s0.h} px (tỉ lệ ${(s0.w / s0.h).toFixed(2)})</dd>
            <dt>Nền</dt><dd>${s0.alpha ? 'Trong suốt (PNG)' : 'Không yêu cầu'}</dd>
            ${slots.length > 1 ? '<dt>Bộ ảnh</dt><dd>Cùng món, cùng vị trí giữa các ảnh</dd>' : ''}
            <dt>Xuất vào game</dt><dd>${s0.ext.toUpperCase()} · ${s0.w}×${s0.h}</dd></dl>
          </div>
          ${hasAny ? `<button class="btn danger" data-act="remove-reskin" data-id="${esc(d.id)}" data-type="${d.type}">Xoá reskin của ô này</button>` : ''}
        </aside>
      </div>
    </div>
  </div>`;
}

function applyView() {
  const a = app.apply;
  return `<div class="modal" role="dialog" aria-modal="true" aria-label="Áp dụng vào game">
    <div class="sheet">
      <header class="sheet-h"><div><b>Áp dụng ${a.ok.length} ảnh vào ${esc(app.project.name)}</b><span class="muted small block">Ghi đè vào <code>${esc(app.project.assetRoot || '.')}/</code> · công cụ build của game tự build lại khi file thay đổi</span></div>
        <button class="iconbtn" data-act="close-apply" aria-label="Đóng">${ICON.close}</button></header>
      <div class="sheet-b">
        <div class="kpis">
          <div class="kpi ok"><small>SẼ ÁP DỤNG</small><b>${a.ok.length}</b><span>ảnh không còn lỗi</span></div>
          <div class="kpi error"><small>BỎ QUA</small><b>${a.skip}</b><span>còn lỗi · giữ ảnh cũ</span></div>
          <div class="kpi"><small>DUNG LƯỢNG ẢNH</small><b>${fmtBytes(a.after)}</b><span>trước đó ${fmtBytes(a.before)}</span></div>
        </div>
        <table><caption>Dung lượng theo nhóm (các ảnh sẽ đổi)</caption>
          <thead><tr><th>Nhóm</th><th class="r">Ảnh</th><th class="r">Trước</th><th class="r">Sau</th></tr></thead>
          <tbody>${a.rows.map((r) => `<tr><td><b>${esc(r.group)}</b></td><td class="r">${r.n}</td><td class="r muted">${fmtBytes(r.before)}</td><td class="r"><b class="${r.after > r.before * 1.1 ? 'warn-t' : 'ok-t'}">${fmtBytes(r.after)}</b></td></tr>`).join('')}</tbody>
        </table>
        <label class="check"><input type="checkbox" data-act="opt-backup" ${a.backup ? 'checked' : ''}> Sao lưu ảnh cũ vào <code>.reskin/backup/${esc(a.stamp)}/</code></label>
      </div>
      <footer class="sheet-f">
        <button class="link" data-act="undo" ${app.project.lastBackup ? '' : 'disabled'}>Hoàn tác lần áp dụng trước</button>
        <span class="grow"></span>
        <button class="btn" data-act="close-apply">Huỷ</button>
        <button class="btn primary" data-act="do-apply" ${a.ok.length ? '' : 'disabled'}>Áp dụng ${a.ok.length} ảnh</button>
      </footer>
    </div>
  </div>`;
}

/* ---------------- project loading ---------------- */
async function refreshRecent() {
  app.recent = (await F.recentList()).sort((a, b) => b.opened - a.opened);
  app.jobs = (await F.jobList()).sort((a, b) => (b.updatedAt || b.received) - (a.updatedAt || a.received));
  for (const j of app.jobs) if (!thumbUrls.has(j.id)) thumbUrls.set(j.id, (j.thumbs || []).map((b) => URL.createObjectURL(b)));
}

/** Update the Game Design project card (state, counts, last activity) of the open folder project. */
async function touchRecent(patch) {
  const p = app.project; if (!p?.recentId) return;
  const rec = await F.recentGet(p.recentId); if (!rec) return;
  await F.recentPut({ ...rec, assets: p.slots.length, done: p.reskins.size, bytes: p.slots.reduce((a, s) => a + s.bytes, 0), ...patch });
}

async function openFolder(handle) {
  if (!(await F.ensurePermission(handle))) { toast('Chưa được cấp quyền đọc/ghi thư mục', 'error'); return; }
  busy('Đang nhận diện game…');
  try {
    const info = await F.detectProject(handle);
    const assetDir = info.assetRoot ? await F.getDir(handle, info.assetRoot) : handle;
    busy('Đang quét ảnh…');
    const found = await F.walkImages(assetDir);
    if (!found.length) { busy(); toast('Không tìm thấy ảnh nào trong thư mục này', 'error'); return; }
    const slots = await buildSlots(found.map((f) => ({ path: f.path, blob: f.file })), (d, t) => busy('Đang phân tích ảnh…', d, t));
    const p = newProject({ kind: 'folder', name: info.name, engine: info.engine, root: handle, assetRoot: info.assetRoot, assetDir, slots,
      files: new Map(found.map((f) => [f.path, f.file])) });
    const saved = await F.readJSON(handle, '.reskin/project.json');
    if (saved) {
      for (const [g, v] of Object.entries(saved.groups || {})) if (p.groups[g]) p.groups[g].rule = v.rule;
      p.fits = saved.fits || {};
      p.lastBackup = saved.lastBackup || null;
    }
    // reskins imported earlier are kept as the artist's masters in .reskin/source/
    const src = await F.tryGetDir(handle, '.reskin/source');
    if (src) {
      const masters = await F.walkImages(src);
      const match = matcher(p.slots);
      let i = 0;
      for (const m of masters) {
        const hit = match(m.path).slot;
        if (hit) p.reskins.set(hit.id, await makeReskin(m.file, m.path.split('/').pop()));
        busy('Đang nạp reskin đã lưu…', ++i, masters.length);
      }
    }
    p.recentId = `${info.name}::${handle.name}`;
    await finishLoad(p);
    const prev = (await F.recentGet(p.recentId)) || {};
    await F.recentPut({ ...prev, id: p.recentId, name: info.name, engine: info.engine, handle, path: handle.name + (info.assetRoot ? '/' + info.assetRoot : ''),
      opened: Date.now(), assets: slots.length, sets: Object.keys(p.sets).length, done: p.reskins.size, bytes: slots.reduce((a, s) => a + s.bytes, 0) });
    if (!prev.id) F.logActivity(`${info.name} — thêm dự án (${slots.length} ảnh, ${Object.keys(p.sets).length} bộ)`, 'info');
  } catch (e) {
    console.error(e); toast('Không mở được thư mục: ' + e.message, 'error');
  } finally { busy(); }
}

function newProject(o) {
  const sets = findSets(o.slots);
  return { reskins: new Map(), fits: {}, lastBackup: null, ...o, sets, groups: defaultGroups(o.slots, sets), slotById: new Map(o.slots.map((s) => [s.id, s])) };
}

async function finishLoad(p) {
  urls.forEach((u) => u && URL.revokeObjectURL(u)); urls.clear();
  app.project = p; app.group = null; app.filter = 'all'; app.search = ''; app.detail = null; app.apply = null; app.limit = 120;
  checkAll(p);
  await refreshPreviews(p, [...p.reskins.keys()]);
  app.screen = 'workspace'; draw();
}

async function refreshPreviews(p, ids) {
  let i = 0;
  for (const id of ids) {
    const s = p.slotById.get(id), r = p.reskins.get(id);
    if (!s || !r) continue;
    if (r.preview) URL.revokeObjectURL(r.preview);
    const fit = p.fits[s.set || s.id] || null;
    r.preview = URL.createObjectURL(await render(r.blob, r, s.w, s.h, fit, 'png', 320));
    if (ids.length > 8) busy('Đang tạo xem trước…', ++i, ids.length);
  }
  busy();
}

async function saveMeta() {
  const p = app.project;
  if (p.kind === 'brief') return saveJob();
  if (p.kind !== 'folder') return;
  const groups = Object.fromEntries(Object.values(p.groups).map((g) => [g.name, { rule: g.rule }]));
  await F.writeJSON(p.root, '.reskin/project.json', { tool: 'SkinForge', version: 1, assetRoot: p.assetRoot, groups, fits: p.fits, lastBackup: p.lastBackup });
}

/* ---------------- importing reskins ---------------- */
async function importEntries(entries) {
  // entries: [{ path, blob }] — files, folder contents or zip contents
  const p = app.project; if (!p) return;
  const expanded = [];
  for (const e of entries) {
    if (/\.zip$/i.test(e.path)) {
      const z = await readZip(e.blob);
      const meta = z['reskin.json'] ? JSON.parse(await z['reskin.json'].text()) : null;
      if (meta?.fits) Object.assign(p.fits, meta.fits);
      for (const [path, blob] of Object.entries(z)) if (F.IMAGE_EXT.has(F.ext(path))) expanded.push({ path: path.replace(/^reskin\//, ''), blob });
    } else if (F.IMAGE_EXT.has(F.ext(e.path))) expanded.push(e);
  }
  const match = matcher(p.slots);
  const changed = [], unknown = [], ambiguous = [];
  let i = 0;
  for (const e of expanded) {
    const m = match(e.path);
    busy('Đang nhập ảnh reskin…', ++i, expanded.length);
    if (m.slot) {
      const r = await makeReskin(e.blob, e.path.split('/').pop());
      p.reskins.set(m.slot.id, r); changed.push(m.slot.id);
      if (p.kind === 'folder') await F.writeFile(p.root, `.reskin/source/${m.slot.dir ? m.slot.dir + '/' : ''}${m.slot.key}.${F.ext(e.path)}`, e.blob);
    } else if (m.ambiguous) ambiguous.push(m.ambiguous); else unknown.push(m.unknown);
  }
  busy();
  checkAll(p);
  await refreshPreviews(p, [...new Set([...changed, ...setMatesOf(p, changed)])]);
  await saveMeta();
  if (changed.length && p.kind === 'folder') {
    const sm = summary(p);
    const text = `${p.name} — nhập ${changed.length} ảnh reskin: ${sm.ok} đạt, ${sm.warn} cảnh báo, ${sm.error} lỗi`;
    await touchRecent({ reskinAt: Date.now(), activity: text }); F.logActivity(text, sm.error ? 'warn' : 'ok');
  }
  draw();
  if (changed.length) toast(`Đã nhập ${changed.length} ảnh reskin`, 'ok');
  if (unknown.length) toast(`${unknown.length} file không khớp tên nào (vd: ${unknown.slice(0, 3).join(', ')})`, 'warn');
  if (ambiguous.length) toast(`${ambiguous.length} tên trùng ở nhiều thư mục — hãy giữ cấu trúc thư mục khi gửi`, 'warn');
}
const setMatesOf = (p, ids) => ids.flatMap((id) => { const s = p.slotById.get(id); return s?.set ? p.sets[s.set].members : []; });

async function collectDrop(dt) {
  const out = [];
  const walk = (entry, prefix) => new Promise((res) => {
    if (entry.isFile) entry.file((f) => { out.push({ path: prefix + f.name, blob: f }); res(); }, () => res());
    else if (entry.isDirectory) {
      const reader = entry.createReader(); const all = [];
      const read = () => reader.readEntries(async (batch) => {
        if (!batch.length) { for (const en of all) await walk(en, prefix + entry.name + '/'); res(); }
        else { all.push(...batch); read(); }
      }, () => res());
      read();
    } else res();
  });
  const items = [...dt.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (items.length) for (const en of items) await walk(en, '');
  else for (const f of dt.files) out.push({ path: f.name, blob: f });
  return out;
}

/* ---------------- brief / reskin packs ---------------- */
async function exportBrief() {
  const p = app.project;
  const files = {};
  let i = 0;
  busy('Đang tạo gói brief…', 0, p.slots.length);
  for (const s of p.slots) {
    files[`originals/${s.dir ? s.dir + '/' : ''}${s.key}.png`] = await toPNG(p.files.get(s.id), s.name);
    busy('Đang tạo gói brief…', ++i, p.slots.length);
  }
  const brief = { tool: 'SkinForge', kind: 'brief', version: 1, project: p.name, engine: p.engine, created: new Date().toISOString(),
    groups: Object.fromEntries(Object.values(p.groups).map((g) => [g.name, { rule: g.rule }])),
    slots: p.slots.map(({ id, key, name, dir, ext, group, w, h, alpha, bytes, fill, set, idx }) => ({ id, key, name, dir, ext, group, w, h, alpha, bytes, fill, set, idx })) };
  files['brief.json'] = JSON.stringify(brief, null, 2);
  files['HUONG-DAN.txt'] = [
    `Gói brief reskin: ${p.name} (${p.slots.length} ảnh)`, '',
    'Cách làm:',
    '1. Mở https://nocgamesorigin-ale.github.io/SkinForge/ → "Mở gói" → chọn file zip này để xem từng ô, yêu cầu và tự kiểm tra.',
    '2. Vẽ lại ảnh trong thư mục originals/. GIỮ NGUYÊN TÊN FILE và cấu trúc thư mục.',
    '3. Ảnh có nền trong suốt thì xuất PNG nền trong suốt.',
    '4. Nhóm "Khung tự do": dáng/kích thước món đồ tự do, nhưng các ảnh trong cùng một bộ (vd bag_1_0 … bag_1_4) phải cùng món, cùng vị trí.',
    '5. Nhóm "Giữ tỉ lệ khung": giữ tỉ lệ khung hình như ảnh gốc.',
    '6. Xong thì bấm "Xuất gói reskin" trên trang, hoặc nén các ảnh đã vẽ thành zip, gửi lại.',
  ].join('\r\n');
  busy('Đang nén…');
  const zip = await makeZip(files);
  busy();
  download(zip, `${slug(p.name)}_brief.zip`);
  toast(`Đã xuất gói brief (${fmtBytes(zip.size)})`, 'ok');
  const text = `${p.name} — xuất brief ${p.slots.length} ảnh (${fmtBytes(zip.size)})`;
  await touchRecent({ briefAt: Date.now(), activity: text }); F.logActivity(text, 'warn');
}

/* ---------------- Artist jobs: a brief pack plus the artist's work, kept in this browser ---------------- */
function setMode(mode, remember = true) {
  app.mode = mode; document.documentElement.dataset.mode = mode || '';
  if (remember) F.pref.set('mode', mode);
}

/** Open a brief zip as an Artist job (created on first open, reused after). */
async function openBriefJob(file, z) {
  const brief = JSON.parse(await z['brief.json'].text());
  const id = `${brief.project}::${brief.created}`;
  let job = await F.jobGet(id);
  if (!job) {
    const reps = brief.slots.filter((s) => s.idx === undefined || s.idx === 0).slice(0, 3);
    job = { id, name: brief.project, briefName: file.name, received: Date.now(), total: brief.slots.length, brief: file,
      thumbs: reps.map((s) => z[`originals/${s.dir ? s.dir + '/' : ''}${s.key}.png`]).filter(Boolean), reskins: [], fits: {}, done: 0, errors: 0 };
    await F.jobPut(job);
  }
  await loadJob(job, z);
}

async function loadJob(job, z) {
  busy('Đang mở project…');
  z ||= await readZip(job.brief);
  const brief = JSON.parse(await z['brief.json'].text());
  const files = new Map();
  for (const s of brief.slots) files.set(s.id, z[`originals/${s.dir ? s.dir + '/' : ''}${s.key}.png`]);
  const p = newProject({ kind: 'brief', name: brief.project, engine: brief.engine, briefName: job.briefName, jobId: job.id,
    slots: brief.slots.map((s) => ({ ...s, set: undefined, idx: undefined })), files });
  for (const [g, v] of Object.entries(brief.groups || {})) if (p.groups[g]) p.groups[g].rule = v.rule;
  p.fits = job.fits || {};
  let i = 0;
  for (const r of job.reskins || []) {
    if (p.slotById.has(r.id)) p.reskins.set(r.id, await makeReskin(r.blob, r.name));
    busy('Đang nạp ảnh đã vẽ…', ++i, job.reskins.length);
  }
  busy();
  await finishLoad(p);
}

/** Persist the artist's work on the open job. sent=true marks it exported as of this save. */
async function saveJob({ sent = false } = {}) {
  const p = app.project; if (!p?.jobId) return;
  const job = await F.jobGet(p.jobId); if (!job) return;
  const sm = summary(p), now = Date.now();
  await F.jobPut({ ...job, reskins: [...p.reskins].map(([id, r]) => ({ id, name: r.name, blob: r.blob })), fits: p.fits,
    done: p.reskins.size, errors: sm.error, updatedAt: now, ...(sent ? { exportedAt: now } : {}) });
}

async function openZip(file) {
  busy('Đang đọc gói…');
  try {
    const z = await readZip(file);
    busy();
    if (z['brief.json']) {
      if (app.mode !== 'artist') { setMode('artist'); toast('Đây là gói brief cho Artist — đã chuyển sang chế độ Artist', 'ok'); }
      await openBriefJob(file, z);
      return;
    }
    const meta = z['reskin.json'] ? JSON.parse(await z['reskin.json'].text()) : null;
    if (app.screen === 'workspace' && app.project) { await importEntries([{ path: file.name, blob: file }]); return; }
    if (!meta) { toast('File zip này không phải gói của SkinForge. Mở project trước rồi kéo ảnh vào.', 'warn'); return; }
    if (app.mode === 'artist') {
      await refreshRecent();
      const job = app.jobs.find((j) => j.name === meta.project);
      if (!job) { toast(`Chưa có project “${meta.project}”. Mở gói brief của project đó trước.`, 'warn'); return; }
      await loadJob(job); await importEntries([{ path: file.name, blob: file }]);
    } else {
      await refreshRecent();
      const rec = app.recent.find((r) => r.name === meta.project);
      if (!rec) { toast(`Chưa có dự án “${meta.project}”. Bấm “Thêm thư mục dự án” và chọn thư mục game đó trước.`, 'warn'); return; }
      await openFolder(rec.handle);
      if (app.project?.name === meta.project) await importEntries([{ path: file.name, blob: file }]);
    }
  } catch (e) { busy(); console.error(e); toast('Không đọc được file zip: ' + e.message, 'error'); }
}

async function exportReskin() {
  const p = app.project, files = {};
  for (const [id, r] of p.reskins) {
    const s = p.slotById.get(id);
    files[`reskin/${s.dir ? s.dir + '/' : ''}${s.key}.${F.ext(r.name) || 'png'}`] = r.blob;
  }
  files['reskin.json'] = JSON.stringify({ tool: 'SkinForge', kind: 'reskin', version: 1, project: p.name, created: new Date().toISOString(), fits: p.fits, count: p.reskins.size }, null, 2);
  busy('Đang nén…');
  const zip = await makeZip(files);
  busy();
  download(zip, `${slug(p.name)}_reskin.zip`);
  toast(`Đã xuất gói reskin (${p.reskins.size} ảnh, ${fmtBytes(zip.size)})`, 'ok');
  if (p.kind === 'brief') await saveJob({ sent: true });
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

/* ---------------- apply to the game ---------------- */
async function openApply() {
  const p = app.project, ok = [], rows = {};
  let skip = 0, before = 0, after = 0, i = 0;
  const ids = [...p.reskins.keys()];
  for (const id of ids) {
    const s = p.slotById.get(id), r = p.reskins.get(id);
    busy('Đang chuẩn bị ảnh xuất…', ++i, ids.length);
    if (r.status === 'error') { skip++; continue; }
    const out = await render(r.blob, r, s.w, s.h, p.fits[s.set || s.id] || null, s.ext);
    ok.push({ s, out });
    const g = (rows[s.group] ||= { group: s.group, n: 0, before: 0, after: 0 });
    g.n++; g.before += s.bytes; g.after += out.size; before += s.bytes; after += out.size;
  }
  busy();
  const now = new Date(), pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const total = p.slots.reduce((a, s) => a + s.bytes, 0);
  app.apply = { ok, skip, rows: Object.values(rows), before: total, after: total - before + after, stamp, backup: true };
  draw();
}

async function doApply() {
  const p = app.project, a = app.apply;
  try {
    let i = 0;
    for (const { s, out } of a.ok) {
      const rel = (p.assetRoot ? p.assetRoot + '/' : '') + s.id;
      if (a.backup) await F.writeFile(p.root, `.reskin/backup/${a.stamp}/${s.id}`, p.files.get(s.id));
      await F.writeFile(p.root, rel, out);
      p.files.set(s.id, out); s.bytes = out.size;
      if (urls.has(s.id)) { URL.revokeObjectURL(urls.get(s.id)); urls.delete(s.id); }
      busy('Đang ghi vào game…', ++i, a.ok.length);
    }
    if (a.backup) { p.lastBackup = a.stamp; await saveMeta(); }
    const text = `${p.name} — áp dụng ${a.ok.length} ảnh vào game${a.backup ? ` (sao lưu ${a.stamp})` : ''}`;
    await touchRecent({ appliedAt: Date.now(), activity: text }); F.logActivity(text, 'info');
    busy(); app.apply = null; draw();
    toast(`Đã áp dụng ${a.ok.length} ảnh vào game`, 'ok');
  } catch (e) { busy(); console.error(e); toast('Lỗi khi ghi file: ' + e.message, 'error'); }
}

async function undoApply() {
  const p = app.project, stamp = p.lastBackup;
  if (!stamp) return;
  if (!confirm(`Khôi phục các ảnh đã sao lưu lúc ${stamp}?`)) return;
  try {
    const dir = await F.getDir(p.root, `.reskin/backup/${stamp}`);
    const files = await F.walkImages(dir);
    let i = 0;
    for (const f of files) {
      const rel = (p.assetRoot ? p.assetRoot + '/' : '') + f.path;
      await F.writeFile(p.root, rel, f.file);
      // keep a handle on the restored game file, not on the backup copy that is deleted below
      const fresh = await F.getFile(p.root, rel);
      p.files.set(f.path, fresh); const s = p.slotById.get(f.path); if (s) s.bytes = fresh.size;
      if (urls.has(f.path)) { URL.revokeObjectURL(urls.get(f.path)); urls.delete(f.path); }
      busy('Đang khôi phục…', ++i, files.length);
    }
    await F.removeEntry(p.root, `.reskin/backup/${stamp}`, true);
    p.lastBackup = null; await saveMeta();
    busy(); app.apply = null; draw();
    toast(`Đã khôi phục ${files.length} ảnh`, 'ok');
  } catch (e) { busy(); console.error(e); toast('Không hoàn tác được: ' + e.message, 'error'); }
}

/* ---------------- events ---------------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return;
  const act = el.dataset.act, p = app.project;
  if (el.tagName === 'A') e.preventDefault();
  if (act === 'open-folder') { try { await openFolder(await F.pickFolder()); } catch (err) { if (err.name !== 'AbortError') toast(err.message, 'error'); } }
  if (act === 'open-recent') { const rec = app.recent.find((r) => r.id === el.dataset.id); if (rec) await openFolder(rec.handle); }
  if (act === 'forget') { if (confirm('Xoá dự án này khỏi danh sách? (Thư mục game không bị xoá.)')) { await F.recentDelete(el.dataset.id); await refreshRecent(); draw(); } }
  if (act === 'home') { app.screen = 'home'; app.project = null; await refreshRecent(); draw(); }
  if (act === 'pick-mode') { setMode(el.dataset.mode, $('#rememberMode')?.checked !== false); await refreshRecent(); draw(); }
  if (act === 'set-mode') { setMode(el.dataset.mode); draw(); }
  if (act === 'recent-brief') {
    const rec = app.recent.find((r) => r.id === el.dataset.id);
    if (rec) { await openFolder(rec.handle); if (app.project?.recentId === rec.id) { try { await exportBrief(); } catch (err) { busy(); toast('Không xuất được brief: ' + err.message, 'error'); } } }
  }
  if (act === 'open-job') { const job = await F.jobGet(el.dataset.id); if (job) await loadJob(job); }
  if (act === 'export-job') {
    const job = await F.jobGet(el.dataset.id);
    if (job) {
      await loadJob(job);
      try { await exportReskin(); } catch (err) { busy(); toast('Không xuất được gói reskin: ' + err.message, 'error'); }
      app.screen = 'home'; app.project = null; await refreshRecent(); draw();   // exported from the home card: stay on home
    }
  }
  if (act === 'forget-job') {
    if (confirm('Xoá project này khỏi trình duyệt? Ảnh bạn đã kéo vào project sẽ mất (file gốc trên máy không bị xoá).')) {
      await F.jobDelete(el.dataset.id); (thumbUrls.get(el.dataset.id) || []).forEach((u) => URL.revokeObjectURL(u)); thumbUrls.delete(el.dataset.id);
      await refreshRecent(); draw();
    }
  }
  if (act === 'group') { app.group = el.dataset.g || null; draw(); }
  if (act === 'filter') { app.filter = el.dataset.f; draw(); }
  if (act === 'more') { app.limit = (app.limit || 120) + 120; draw(); }
  if (act === 'toggle-rule') { const g = p.groups[el.dataset.g]; g.rule = g.rule === 'free' ? 'fixed' : 'free'; checkAll(p); await saveMeta(); draw(); }
  if (act === 'detail') { const c = el.dataset.id; app.detail = { type: p.sets[c] ? 'set' : 'slot', id: c }; draw(); }
  if (act === 'close-detail') { app.detail = null; draw(); }
  if (act === 'autofit' || act === 'unfit') {
    const k = el.dataset.k, ids = p.sets[k] ? p.sets[k].members : [k];
    if (act === 'autofit') p.fits[k] = autoFit(p, ids); else delete p.fits[k];
    checkAll(p); await refreshPreviews(p, ids.filter((id) => p.reskins.has(id))); await saveMeta(); draw();
  }
  if (act === 'remove-reskin') {
    const ids = el.dataset.type === 'set' ? p.sets[el.dataset.id].members : [el.dataset.id];
    for (const id of ids) {
      const s = p.slotById.get(id), r = p.reskins.get(id); if (!r) continue;
      if (r.preview) URL.revokeObjectURL(r.preview);
      p.reskins.delete(id);
      if (p.kind === 'folder') { try { await F.removeEntry(p.root, `.reskin/source/${s.dir ? s.dir + '/' : ''}${s.key}.${F.ext(r.name)}`); } catch {} }
    }
    delete p.fits[el.dataset.id]; checkAll(p); await saveMeta(); draw();
  }
  const guard = async (fn, what) => { try { await fn(); } catch (err) { busy(); console.error(err); toast(`${what}: ${err.message}`, 'error'); } };
  if (act === 'export-brief') await guard(exportBrief, 'Không xuất được brief');
  if (act === 'export-reskin') await guard(exportReskin, 'Không xuất được gói reskin');
  if (act === 'open-apply') await guard(openApply, 'Không chuẩn bị được ảnh xuất');
  if (act === 'close-apply') { app.apply = null; draw(); }
  if (act === 'do-apply') await doApply();
  if (act === 'undo') await undoApply();
});
document.addEventListener('change', async (e) => {
  const el = e.target, act = el.dataset?.act; if (!act) return;
  if (act === 'open-zip' && el.files[0]) await openZip(el.files[0]);
  if (act === 'import-files') await importEntries([...el.files].map((f) => ({ path: f.name, blob: f })));
  if (act === 'pick-one' && el.files[0]) {
    const s = app.project.slotById.get(el.dataset.id);
    await importEntries([{ path: `${s.dir ? s.dir + '/' : ''}${s.key}.${F.ext(el.files[0].name)}`, blob: el.files[0] }]);
  }
  if (act === 'toggle-safe') { app.safe = el.checked; draw(); }
  if (act === 'opt-backup') app.apply.backup = el.checked;
  el.value && el.type === 'file' && (el.value = '');
});
document.addEventListener('input', (e) => {
  if (e.target.dataset?.act !== 'search') return;
  app.search = e.target.value;
  clearTimeout(app._t); app._t = setTimeout(() => { const pos = e.target.selectionStart; draw(); const i = $('[data-act="search"]'); i?.focus(); i?.setSelectionRange(pos, pos); }, 200);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (app.detail || app.apply)) { app.detail = null; app.apply = null; draw(); } });
let dragDepth = 0;
addEventListener('dragenter', (e) => { if (app.screen !== 'workspace') return; e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  const entries = await collectDrop(e.dataTransfer);
  if (!entries.length) return;
  if (app.screen === 'home') { const z = entries.find((x) => /\.zip$/i.test(x.path)); if (z) await openZip(z.blob); return; }
  await importEntries(entries);
});

// Dev only: lets automated tests open a folder without the native picker.
if (import.meta.env.DEV) window.__skinforge = { app, openFolder, importEntries, openZip, loadJob, setMode, refreshRecent, draw };

refreshRecent().then(draw);
