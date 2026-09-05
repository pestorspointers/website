/**
 * Downloads the actual video files behind every embed the crawl found.
 *
 * Kajabi hosts course video on Wistia, and Wistia publishes a public JSON
 * manifest per media that lists direct MP4 renditions — including the original
 * upload. That is what this pulls, so you end up with real files rather than a
 * list of embed codes that die with the account.
 *
 * YouTube / Vimeo embeds are recorded but not downloaded (they live on your own
 * channels and survive the cancellation). If yt-dlp is installed they are
 * fetched too.
 *
 *   npm run videos
 *   node videos.js --video-quality original
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config, paths } from './config.js';
import {
  ensureDir, exists, readJson, writeJson, writeText, download, pool, humanBytes, c,
} from './lib/util.js';

const run = promisify(execFile);

// ── Gather every embed the crawl recorded ────────────────────────────────────

const manifest = await readJson(paths.manifest);
if (!manifest) {
  console.error(c.red('  ✗ No manifest.json — run `npm run crawl` first.'));
  process.exit(1);
}

const found = new Map(); // `${provider}:${id}` -> {provider, id, pages[]}

let pageDirs = [];
try {
  pageDirs = await fs.readdir(paths.pages);
} catch {
  console.error(c.red('  ✗ No pages/ directory — run `npm run crawl` first.'));
  process.exit(1);
}

/**
 * The lesson's own title, which Kajabi does not put in <title> — every lesson
 * page shares the site name. h1 is the module, h2 is Kajabi's "N Lessons"
 * counter, and the lesson title is the first heading that is neither.
 *
 * This matters well beyond the report: it is the name that matches the files
 * already sitting in S3. Wistia's own media names are upload paths carrying
 * site ids and abbreviations ("Intro_to_Stage_1"), while the S3 keys were
 * derived from the lesson titles ("Introduction_to_Stage__1__4_15_"). Matching
 * on the lesson title is the difference between a clean hit and a coin flip.
 */
const COUNTER = /^\d+\s+lessons?$/i;
function lessonTitleFrom(data) {
  const headings = (data.headings ?? []).map((h) => h.text).filter(Boolean);
  const moduleName = headings[0] ?? null;
  return headings.find((h) => h !== moduleName && !COUNTER.test(h.trim())) ?? null;
}

for (const slug of pageDirs) {
  const data = await readJson(path.join(paths.pages, slug, 'page.json'));
  if (!data?.videos) continue;
  const lessonTitle = lessonTitleFrom(data);
  for (const v of data.videos) {
    if (!v.id) continue;
    const key = `${v.provider}:${v.id}`;
    const entry = found.get(key) ?? { ...v, pages: [] };
    entry.pages.push({ slug, url: data.finalUrl, title: data.title, lessonTitle });
    // First lesson title wins — a video embedded on several pages belongs to
    // the lesson it was made for.
    if (!entry.lessonTitle && lessonTitle) entry.lessonTitle = lessonTitle;
    found.set(key, entry);
  }
}

const all = [...found.values()];
const wistia = all.filter((v) => v.provider === 'wistia');
const external = all.filter((v) => v.provider === 'youtube' || v.provider === 'vimeo');
const direct = all.filter((v) => v.provider === 'file');

console.log(`
${c.bold('Video export')}

  wistia (downloadable)  ${wistia.length}
  youtube / vimeo        ${external.length}
  direct file            ${direct.length}
`);

await ensureDir(paths.videos);

// ── Wistia ───────────────────────────────────────────────────────────────────

/** Pick the rendition we want from Wistia's asset list. */
function chooseAsset(assets) {
  const playable = assets.filter(
    (a) => (a.ext === 'mp4' || a.type?.includes('mp4') || a.type === 'original') && a.url
  );
  if (playable.length === 0) return null;

  if (config.videoQuality === 'original') {
    const orig = playable.find((a) => a.type === 'original');
    if (orig) return orig;
  }
  if (config.videoQuality === 'medium') {
    const sorted = [...playable].sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0));
    return sorted[Math.floor(sorted.length / 2)];
  }
  // 'best' — largest frame area, then bitrate, then file size.
  return [...playable].sort((a, b) => {
    const area = (x) => (x.width ?? 0) * (x.height ?? 0);
    return area(b) - area(a) || (b.bitrate ?? 0) - (a.bitrate ?? 0) || (b.size ?? 0) - (a.size ?? 0);
  })[0];
}

function safeName(s, fallback) {
  const cleaned = (s ?? '').replace(/[^a-zA-Z0-9 ._-]/g, '').trim().replace(/\s+/g, '-');
  return (cleaned || fallback).slice(0, 90);
}

let totalBytes = 0;
const results = [];

const wistiaResults = await pool(wistia, 2, async (v, i) => {
  const label = `${String(i + 1).padStart(3)}/${wistia.length}`;
  let meta;
  try {
    const res = await fetch(`https://fast.wistia.net/embed/medias/${v.id}.json`, {
      headers: { 'user-agent': config.userAgent, referer: manifest.site },
    });
    if (!res.ok) {
      console.log(`  ${c.red('✗')} ${label} ${v.id} — metadata HTTP ${res.status}`);
      return { ...v, failed: true, reason: `metadata HTTP ${res.status}` };
    }
    meta = (await res.json()).media;
  } catch (err) {
    console.log(`  ${c.red('✗')} ${label} ${v.id} — ${String(err).split('\n')[0]}`);
    return { ...v, failed: true, reason: String(err) };
  }

  const asset = chooseAsset(meta.assets ?? []);
  if (!asset) {
    console.log(`  ${c.red('✗')} ${label} ${v.id} — no MP4 rendition`);
    return { ...v, failed: true, reason: 'no mp4 rendition', name: meta.name };
  }

  const name = safeName(meta.name, v.id);
  const dir = path.join(paths.videos, 'wistia');
  const dest = path.join(dir, `${name}--${v.id}.mp4`);

  await writeJson(path.join(dir, `${name}--${v.id}.json`), {
    id: v.id,
    name: meta.name,
    duration: meta.duration,
    created: meta.created,
    chosenAsset: { type: asset.type, width: asset.width, height: asset.height, size: asset.size },
    assets: (meta.assets ?? []).map((a) => ({
      type: a.type, ext: a.ext, width: a.width, height: a.height, size: a.size, url: a.url,
    })),
    appearsOn: v.pages,
  });

  if (config.inventoryOnly) {
    console.log(
      `  ${c.cyan('▸')} ${label} ${name} ` +
        `${c.dim(`${asset.width}x${asset.height} · ${humanBytes(asset.size ?? 0)} · not downloaded`)}`
    );
    return {
      ...v,
      name: meta.name,
      lessonTitle: v.lessonTitle ?? null,
      duration: meta.duration,
      resolution: `${asset.width}x${asset.height}`,
      bytes: asset.size ?? null,
      sourceUrl: asset.url,
      inventoryOnly: true,
    };
  }

  if (await exists(dest)) {
    const stat = await fs.stat(dest);
    console.log(`  ${c.dim('·')} ${label} ${name} ${c.dim('(cached)')}`);
    return { ...v, name: meta.name, localPath: path.relative(config.outDir, dest), bytes: stat.size, cached: true };
  }

  // Wistia serves originals as `.bin`; the bytes are a normal MP4.
  const urls = [asset.url, asset.url.replace(/\.bin$/, '.mp4')];
  let res = { ok: false };
  for (const url of urls) {
    res = await download(url, dest, {
      headers: { 'user-agent': config.userAgent, referer: 'https://fast.wistia.net/' },
    });
    if (res.ok) break;
  }

  if (!res.ok) {
    console.log(`  ${c.red('✗')} ${label} ${name} — download failed (${res.status ?? res.error})`);
    return { ...v, failed: true, reason: `download ${res.status ?? res.error}`, name: meta.name };
  }

  totalBytes += res.bytes;
  console.log(
    `  ${c.green('✓')} ${label} ${name} ${c.dim(`${asset.width}x${asset.height} · ${humanBytes(res.bytes)}`)}`
  );

  // Captions and poster frame, when they exist. Wistia answers with a valid but
  // cue-less VTT when a media has no captions — drop those rather than litter
  // the export with empty subtitle files.
  const vtt = path.join(dir, `${name}--${v.id}.vtt`);
  const gotVtt = await download(
    `https://fast.wistia.net/embed/captions/${v.id}.vtt`,
    vtt,
    { headers: { 'user-agent': config.userAgent }, retries: 0 }
  );
  if (gotVtt.ok) {
    const body = await fs.readFile(vtt, 'utf8').catch(() => '');
    if (!/\d\d:\d\d/.test(body)) await fs.rm(vtt, { force: true });
  }
  const still = (meta.assets ?? []).find((a) => a.type === 'still_image');
  if (still) {
    await download(still.url, path.join(dir, `${name}--${v.id}.jpg`), {
      headers: { 'user-agent': config.userAgent },
      retries: 0,
    });
  }

  return {
    ...v,
    name: meta.name,
    duration: meta.duration,
    localPath: path.relative(config.outDir, dest),
    bytes: res.bytes,
    resolution: `${asset.width}x${asset.height}`,
  };
});
results.push(...wistiaResults);

// ── Direct <video src> files ─────────────────────────────────────────────────

if (direct.length > 0 && config.inventoryOnly) {
  console.log(`\n${c.bold('Direct video files')} — ${direct.length} catalogued, not downloaded\n`);
  results.push(...direct.map((v) => ({ ...v, sourceUrl: v.url, inventoryOnly: true })));
} else if (direct.length > 0) {
  console.log(`\n${c.bold('Direct video files')}\n`);
  const directResults = await pool(direct, 3, async (v) => {
    const name = safeName(path.basename(new URL(v.url).pathname), 'video');
    const dest = path.join(paths.videos, 'direct', name.endsWith('.mp4') ? name : `${name}.mp4`);
    if (await exists(dest)) return { ...v, localPath: path.relative(config.outDir, dest), cached: true };
    const res = await download(v.url, dest, {
      headers: { 'user-agent': config.userAgent, referer: manifest.site },
    });
    if (!res.ok) {
      console.log(`  ${c.red('✗')} ${name}`);
      return { ...v, failed: true, reason: `download ${res.status ?? res.error}` };
    }
    totalBytes += res.bytes;
    console.log(`  ${c.green('✓')} ${name} ${c.dim(humanBytes(res.bytes))}`);
    return { ...v, localPath: path.relative(config.outDir, dest), bytes: res.bytes };
  });
  results.push(...directResults);
}

// ── YouTube / Vimeo ──────────────────────────────────────────────────────────

let ytdlp = null;
try {
  if (!config.inventoryOnly) {
    await run('yt-dlp', ['--version']);
    ytdlp = 'yt-dlp';
  }
} catch {
  /* not installed — that's fine */
}

if (external.length > 0) {
  if (ytdlp) {
    console.log(`\n${c.bold('YouTube / Vimeo')} — yt-dlp found, downloading\n`);
    for (const v of external) {
      const url =
        v.provider === 'youtube'
          ? `https://www.youtube.com/watch?v=${v.id}`
          : `https://vimeo.com/${v.id}`;
      const dir = path.join(paths.videos, v.provider);
      await ensureDir(dir);
      try {
        await run(ytdlp, [
          '-f', 'bv*+ba/b',
          '--merge-output-format', 'mp4',
          '--no-playlist',
          '--write-thumbnail',
          '--write-sub', '--sub-langs', 'all', '--convert-subs', 'srt',
          '-o', path.join(dir, '%(title)s--%(id)s.%(ext)s'),
          url,
        ]);
        console.log(`  ${c.green('✓')} ${v.provider}:${v.id}`);
        results.push({ ...v, downloadedVia: 'yt-dlp', sourceUrl: url });
      } catch (err) {
        console.log(`  ${c.red('✗')} ${v.provider}:${v.id} — ${String(err).split('\n')[0]}`);
        results.push({ ...v, failed: true, reason: 'yt-dlp failed', sourceUrl: url });
      }
    }
  } else {
    console.log(
      `\n${c.bold('YouTube / Vimeo')} — ${external.length} embeds recorded, not downloaded.\n` +
        c.dim('  These live on your own channels and survive the Kajabi cancellation.\n') +
        c.dim('  To pull local copies anyway: brew install yt-dlp && npm run videos\n')
    );
    for (const v of external) {
      results.push({
        ...v,
        sourceUrl:
          v.provider === 'youtube'
            ? `https://www.youtube.com/watch?v=${v.id}`
            : `https://vimeo.com/${v.id}`,
        note: 'not downloaded (install yt-dlp to fetch)',
      });
    }
  }
}

// ── Index ────────────────────────────────────────────────────────────────────

await writeJson(path.join(paths.videos, 'index.json'), {
  exportedAt: new Date().toISOString(),
  totals: {
    embeds: all.length,
    downloaded: results.filter((r) => r.localPath).length,
    failed: results.filter((r) => r.failed).length,
    bytes: totalBytes,
  },
  videos: results,
});

const rows = results
  .map((r) => {
    const where = (r.pages ?? []).map((p) => p.url).join('<br>');
    const file = r.localPath ?? r.sourceUrl ?? '—';
    const status = r.failed ? `⚠️ ${r.reason}` : r.localPath ? '✅ downloaded' : 'ℹ️ link only';
    return `| ${r.provider} | ${r.name ?? r.id} | ${status} | ${file} | ${where} |`;
  })
  .join('\n');

await writeText(
  path.join(paths.videos, 'VIDEOS.md'),
  `# Video inventory\n\n` +
    `Exported ${new Date().toISOString()} · ${results.filter((r) => r.localPath).length}` +
    ` of ${all.length} embeds downloaded (${humanBytes(totalBytes)}).\n\n` +
    `| Provider | Title | Status | File | Appears on |\n|---|---|---|---|---|\n${rows}\n`
);

console.log(`
${c.green(c.bold('Video export complete'))}

  downloaded  ${results.filter((r) => r.localPath).length}/${all.length}  (${humanBytes(totalBytes)})
  failed      ${results.filter((r) => r.failed).length}
  inventory   ${path.join(paths.videos, 'VIDEOS.md')}
`);
