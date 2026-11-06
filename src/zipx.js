// Zip in/out with fflate (no server: everything is built in the browser).
import { zip, unzip } from 'fflate';

export async function makeZip(files) {
  // files: { "path/in/zip": Blob|string }
  const input = {};
  for (const [path, v] of Object.entries(files)) {
    const data = typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(await v.arrayBuffer());
    const stored = /\.(png|webp|jpe?g|mp3|ogg)$/i.test(path);   // already compressed
    input[path] = [data, { level: stored ? 0 : 6 }];
  }
  return new Promise((res, rej) => zip(input, (err, out) => err ? rej(err) : res(new Blob([out], { type: 'application/zip' }))));
}

export async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const files = await new Promise((res, rej) => unzip(buf, (err, out) => err ? rej(err) : res(out)));
  const out = {};
  for (const [path, data] of Object.entries(files)) {
    if (path.endsWith('/') || path.startsWith('__MACOSX/')) continue;
    out[path] = new Blob([data]);
  }
  return out;
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
