import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export async function writeText(file, text) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, text);
}

/**
 * A URL path turned into a stable, filesystem-safe folder name.
 * `/products/get-unstuck?x=1` → `products__get-unstuck`
 * `/` → `_home`
 */
export function slugForUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return '_invalid';
  }
  let slug = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '__');
  if (!slug) slug = '_home';
  if (u.search) {
    // Keep query-string variants distinct without letting names explode.
    slug += `__q${hash(u.search)}`;
  }
  slug = slug.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
  return slug || '_home';
}

/** Short, stable, non-cryptographic hash — used only for filename uniqueness. */
export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Strip the fragment and common tracking params so we don't crawl dupes. */
export function normalizeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    u.hash = '';
    for (const p of [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'mc_cid', 'mc_eid', '_ga',
    ]) {
      u.searchParams.delete(p);
    }
    // Collapse `/path/` and `/path` to one entry.
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return null;
  }
}

/** Mirror a remote URL into a local path under `root`, preserving host + path. */
export function localPathForAsset(root, rawUrl) {
  const u = new URL(rawUrl);
  let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (!p || p.endsWith('/')) p += 'index';
  // Long Kajabi asset paths blow past filename limits; keep the tail + a hash.
  const segments = p.split('/').map((s) => s.replace(/[^a-zA-Z0-9._-]/g, '-'));
  const file = segments.pop();
  const safeFile = file.length > 100 ? `${hash(file)}-${file.slice(-80)}` : file;
  const dir = segments.slice(-4).join('/');
  const qs = u.search ? `-${hash(u.search)}` : '';
  const ext = path.extname(safeFile);
  const base = ext ? safeFile.slice(0, -ext.length) : safeFile;
  return path.join(root, u.hostname, dir, `${base}${qs}${ext}`);
}

/** Download a URL to disk. Returns {ok, path, bytes, status, contentType}. */
export async function download(url, destPath, { headers = {}, retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (!res.ok) {
        if (res.status >= 500 && attempt < retries) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        return { ok: false, status: res.status, url };
      }
      await ensureDir(path.dirname(destPath));
      await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
      const stat = await fs.stat(destPath);
      return {
        ok: true,
        path: destPath,
        bytes: stat.size,
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        url,
      };
    } catch (err) {
      if (attempt === retries) return { ok: false, error: String(err), url };
      await sleep(800 * (attempt + 1));
    }
  }
  return { ok: false, url };
}

/** Run `worker` over `items` with bounded concurrency, preserving order. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = { error: String(err) };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

export function humanBytes(n) {
  if (!Number.isFinite(n)) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${units[i]}`;
}

/** Minimal ANSI colouring — no dependency needed for a nicer console. */
export const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
