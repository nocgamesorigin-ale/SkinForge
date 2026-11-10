// GitLab: hand the applied art to the team as a branch + Merge Request, straight from the browser.
//
// Two ways, picked automatically:
//  1. GitLab API (no git on this machine): commit the changed files on a new branch, open an MR.
//     Works when none of the changed files are stored in Git LFS — the LFS store of gitlab.com does not accept
//     uploads from a web page (no CORS), so LFS files cannot go through the API.
//  2. A small script written into the game folder (.reskin/push-reskin.bat / .sh): double-click it and the local
//     git (with Git LFS) commits only these files onto the chosen branch and opens the MR with GitLab push options,
//     without switching branches or touching the working copy.
import * as F from './fsx.js';

const KEY = (id) => `gitlab.${id}`;
/** { host, project, token, target, subdir } saved per project on this machine only. */
export const loadCfg = (id) => F.pref.get(KEY(id), null);
export const saveCfg = (id, cfg) => F.pref.set(KEY(id), cfg);

function api(cfg) {
  const base = `${cfg.host.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(cfg.project)}`;
  return async (path, opts = {}) => {
    let res;
    try {
      res = await fetch(base + path, { ...opts, headers: { 'PRIVATE-TOKEN': cfg.token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers } });
    } catch (e) { throw new Error(`Không kết nối được ${cfg.host} (mạng / CORS): ${e.message}`); }
    if (!res.ok) {
      let msg = ''; try { const j = await res.json(); msg = typeof j.message === 'string' ? j.message : JSON.stringify(j.message || j.error || j); } catch {}
      const hint = res.status === 401 ? ' — token sai hoặc hết hạn' : res.status === 403 ? ' — token thiếu quyền (cần scope api, vai trò Developer trở lên)' : res.status === 404 ? ' — không thấy project / nhánh / file' : '';
      throw Object.assign(new Error(`GitLab ${res.status}${hint}${msg ? ': ' + msg : ''}`), { status: res.status });
    }
    return res.status === 204 ? null : res.json();
  };
}

/** Check the settings: project exists, token works, target branch exists. Returns project info. */
export async function testCfg(cfg) {
  const call = api(cfg);
  const proj = await call('');
  const target = cfg.target || proj.default_branch;
  await call(`/repository/branches/${encodeURIComponent(target)}`);
  return { name: proj.path_with_namespace, web: proj.web_url, target, lfs: !!proj.lfs_enabled };
}

/** gitattributes glob → RegExp (enough for "*.png", "Assets/**\/*.psd", "*.[pP][nN][gG]"). */
function globRe(g) {
  let r = g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?');
  return new RegExp(g.includes('/') ? `^${r.replace(/^\//, '')}$` : `(^|/)${r}$`);
}
/** Paths (relative to the repo root) stored in Git LFS on the target branch. */
export async function lfsMatcher(cfg, target) {
  let text = '';
  try {
    const res = await fetch(`${cfg.host.replace(/\/+$/, '')}/api/v4/projects/${encodeURIComponent(cfg.project)}/repository/files/.gitattributes/raw?ref=${encodeURIComponent(target)}`, { headers: { 'PRIVATE-TOKEN': cfg.token } });
    if (res.ok) text = await res.text();
  } catch {}
  const pats = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && /filter=lfs/.test(l)).map((l) => globRe(l.split(/\s+/)[0]));
  return (path) => pats.some((re) => re.test(path));
}

const b64 = async (blob) => {
  const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Branch names of the project, default branch first. */
export async function listBranches(cfg) {
  const call = api(cfg), out = [];
  for (let page = 1; page <= 5; page++) {
    const list = await call(`/repository/branches?per_page=100&page=${page}`);
    out.push(...list.map((b) => ({ name: b.name, def: !!b.default, protected: !!b.protected, at: b.commit?.committed_date })));
    if (list.length < 100) break;
  }
  return out.sort((a, b) => (b.def - a.def) || String(b.at).localeCompare(String(a.at)));
}

/**
 * Commit `files` ([{ path (repo-relative), blob }]) to `branch` — an existing branch, or a new one made from `base` —
 * and, when `mr` is given, open a Merge Request into mr.target (an open MR for the same branches is reused).
 * Big batches go in several commits (each request stays under ~25 MB).
 */
export async function pushToGitLab(cfg, { files, branch, newBranch, base, message, mr, onProgress }) {
  const call = api(cfg);
  const proj = await call('');
  let first = true, done = 0, chunk = [], size = 0, last = null;
  const flush = async () => {
    if (!chunk.length) return;
    last = await call('/repository/commits', { method: 'POST', body: JSON.stringify({
      branch, ...(first && newBranch ? { start_branch: base } : {}), commit_message: message + (first ? '' : '\n\n(tiếp)'),
      actions: chunk.map((x) => ({ action: 'update', file_path: x.path, content: x.content, encoding: 'base64' })) }) });
    first = false; chunk = []; size = 0;
  };
  for (const f of files) {
    const content = await b64(f.blob);
    if (size + content.length > 25e6) await flush();
    chunk.push({ path: f.path, content }); size += content.length;
    onProgress?.(++done, files.length);
  }
  await flush();
  const out = { branch, commitUrl: last?.web_url || `${proj.web_url}/-/commit/${last?.id}` };
  if (mr) {
    const open = await call(`/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}&target_branch=${encodeURIComponent(mr.target)}`);
    if (open.length) Object.assign(out, { url: open[0].web_url, iid: open[0].iid, reused: true });
    else {
      const m = await call('/merge_requests', { method: 'POST', body: JSON.stringify({ source_branch: branch, target_branch: mr.target, title: mr.title, description: mr.description, remove_source_branch: !!newBranch }) });
      Object.assign(out, { url: m.web_url, iid: m.iid, reused: false });
    }
    out.target = mr.target;
  }
  return out;
}

/**
 * Scripts for repos that keep art in Git LFS. They never switch branches or touch the working copy: the chosen files
 * are staged into a temporary index on top of the remote branch, committed with `git commit-tree` and pushed
 * (Git LFS uploads the objects in its pre-push hook). Paths and the message travel in UTF-8 files next to the script.
 */
export function pushScripts({ branch, newBranch, base, mr, stamp }) {
  const from = newBranch ? base : branch;
  const opts = mr ? ` -o merge_request.create -o merge_request.target=${mr.target}${newBranch ? ' -o merge_request.remove_source_branch' : ''} -o "merge_request.title=${mr.title.replace(/["%^&|<>]/g, '')}"` : '';
  const idx = `skinforge-index-${stamp}`;
  const bat = ['@echo off', 'chcp 65001 >nul', 'setlocal', 'cd /d "%~dp0.."',
    `echo SkinForge: commit vao nhanh ${branch}${newBranch ? ` (moi, tach tu ${base})` : ''}${mr ? ` + Merge Request vao ${mr.target}` : ''}`,
    'git rev-parse --is-inside-work-tree >nul 2>&1 || (echo Thu muc nay khong phai git repo & goto fail)',
    `git fetch origin ${from} || goto fail`,
    `set "GIT_INDEX_FILE=%TEMP%\\${idx}"`,
    `git read-tree origin/${from} || goto fail`,
    'git add --pathspec-from-file=.reskin/push-files.txt || goto fail',
    'for /f %%t in (\'git write-tree\') do set TREE=%%t',
    `for /f %%c in ('git commit-tree %TREE% -p origin/${from} -F .reskin/push-message.txt') do set COMMIT=%%c`,
    'set "GIT_INDEX_FILE="', `del "%TEMP%\\${idx}" >nul 2>&1`,
    'if "%COMMIT%"=="" goto fail',
    `git push origin %COMMIT%:refs/heads/${branch}${opts} || goto fail`,
    `git fetch origin ${branch} >nul 2>&1`,
    'echo.', `echo Xong: da day vao nhanh ${branch}.${mr ? ' Link Merge Request nam o dong "remote:" phia tren.' : ''}`, 'pause', 'exit /b 0',
    ':fail', 'set "GIT_INDEX_FILE="', `del "%TEMP%\\${idx}" >nul 2>&1`, 'echo.', 'echo Chua day duoc - xem loi phia tren.', 'pause', 'exit /b 1'].join('\r\n');
  const sh = ['#!/bin/sh', 'set -e', 'cd "$(dirname "$0")/.."', `git fetch origin ${from}`,
    `export GIT_INDEX_FILE="\${TMPDIR:-/tmp}/${idx}"`, `git read-tree origin/${from}`,
    'git add --pathspec-from-file=.reskin/push-files.txt', 'TREE=$(git write-tree)',
    `COMMIT=$(git commit-tree "$TREE" -p origin/${from} -F .reskin/push-message.txt)`, 'unset GIT_INDEX_FILE', `rm -f "\${TMPDIR:-/tmp}/${idx}"`,
    `git push origin "$COMMIT:refs/heads/${branch}"${opts.replace(/"merge_request.title=([^"]*)"/, "'merge_request.title=$1'")}`,
    `echo "Xong: đã đẩy vào nhánh ${branch}."`].join('\n');
  return { bat, sh };
}
