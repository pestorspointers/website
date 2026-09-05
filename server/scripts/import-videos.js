/**
 * Moves videos into the platform's S3 bucket, one at a time, without ever
 * holding more than a single file on disk.
 *
 * For each video:
 *   1. find or create its row in `videos` (that row's id is the S3 key)
 *   2. if the object is already in S3 at the right size → skip, nothing downloaded
 *   3. stream the source down to a temp file
 *   4. multipart-upload it to `uploads/raw/<id>/original.mp4`
 *   5. verify the uploaded size matches the local file
 *   6. delete the local file — always, including on failure
 *
 * Step 2 is what makes this safe to re-run: videos already in the bucket cost
 * one HeadObject and nothing else, so an interrupted run resumes for free.
 *
 * Usage:
 *   node scripts/import-videos.js --from ../tools/kajabi-export/export/videos/index.json
 *   node scripts/import-videos.js --from list.json --course get-unstuck --transcode
 *   node scripts/import-videos.js --from list.json --dry-run
 *
 * The source file is either the exporter's `videos/index.json` or a plain list:
 *   [{ "title": "Lesson 1", "url": "https://…/master.mp4", "description": "…" }]
 */

import fs from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  S3Client,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const { db, unwrap } = await import('../src/config/supabase.js');
const { submitTranscodeJob, hlsKeyFor } = await import('../src/services/mediaconvert.js');

// ── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      out[a.slice(2)] = next && !next.startsWith('--') ? (i += 1, next) : true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const opts = {
  from: args.from,
  course: args.course ?? null,
  accessType: args['access-type'] ?? 'course',
  tmpDir: args.tmp ?? path.join(os.tmpdir(), 'video-import'),
  limit: args.limit ? Number(args.limit) : Infinity,
  dryRun: Boolean(args['dry-run']),
  force: Boolean(args.force),
  keepLocal: Boolean(args['keep-local']),
  transcode: Boolean(args.transcode),
  publish: Boolean(args.publish),
  filter: args.filter ? new RegExp(args.filter, 'i') : null,
  adopt: Boolean(args.adopt),
  adoptBucket: args['adopt-bucket'] ?? null,
  adoptPrefix: args['adopt-prefix'] ?? '',
  matchThreshold: args['match-threshold'] ? Number(args['match-threshold']) : 0.75,
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function bytes(n) {
  if (!Number.isFinite(n)) return '?';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${u[i]}`;
}

if (!opts.from) {
  console.error(`
${c.bold('import-videos')} — pull videos into S3 one at a time

  ${c.bold('--from <file>')}        required. exporter videos/index.json, or a
                       plain [{title, url}] list
  --course <slug>      attach every imported video to this course
  --access-type <t>    public | course | purchase        ${c.dim('(default: course)')}
  --transcode          submit the MediaConvert job after upload
  --publish            mark the video published once uploaded
  --filter <regex>     only videos whose title matches. --course applies to
                       the whole run, so use this to do one course at a time
  --limit <n>          stop after n videos
  --tmp <dir>          where to stage downloads    ${c.dim('(default: $TMPDIR/video-import)')}
  --force              re-upload even if already in S3
  --keep-local         don't delete the staged file
  --dry-run            show the plan, touch nothing

  ${c.bold('Already moved some by hand?')}
  --adopt              match sources against files already in S3 and
                       server-side copy them into place — no re-download
  --adopt-bucket <b>   scan a different bucket for those files
  --adopt-prefix <p>   limit the scan to one prefix
  --match-threshold    0-1 name similarity to accept  ${c.dim('(default: 0.62)')}

  Always pair --adopt with --dry-run first and read the match table.
`);
  process.exit(1);
}

// ── Source list ──────────────────────────────────────────────────────────────

const sourcePath = path.resolve(opts.from);
let raw;
try {
  raw = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
} catch (err) {
  console.error(
    c.red(
      `  ✗ ${err.code === 'ENOENT' ? 'No such file' : 'Could not read'}: ${sourcePath}\n`
    ) + c.dim(`    ${err.code === 'ENOENT' ? '' : err.message}`)
  );
  process.exit(1);
}

/** Accept either the exporter's index.json shape or a bare array. */
function normalizeSources(input) {
  const list = Array.isArray(input) ? input : (input.videos ?? []);
  return list
    .map((v) => ({
      // Prefer the lesson title. Wistia's `name` is the original upload path
      // ("…/f0f472e-…_Intro_to_Stage_1.mp4") — full of ids and abbreviations,
      // and a poor match for S3 keys that were named after the lesson.
      title: (v.lessonTitle ?? v.name ?? v.title ?? '').trim(),
      wistiaName: v.name ?? null,
      sourceId: v.id ?? null,
      // Exporter records `sourceUrl` in --inventory-only mode and `localPath`
      // when it downloaded. Either is a valid source here.
      url: v.sourceUrl ?? v.url ?? null,
      localPath: v.localPath ?? null,
      description: v.description ?? '',
      durationSeconds: v.duration ? Math.round(v.duration) : null,
      expectedBytes: v.bytes ?? null,
      provider: v.provider ?? 'file',
    }))
    .filter((v) => {
      if (!v.title) return false;
      // YouTube/Vimeo watch pages aren't fetchable media.
      if (/youtube\.com|youtu\.be|vimeo\.com/.test(v.url ?? '')) return false;
      return Boolean(v.url || v.localPath);
    });
}

// `--course` applies to every video in a run, so a mixed list would land the
// whole library in one course. Filter to one course's videos per run.
const allSources = normalizeSources(raw);
const filtered = opts.filter
  ? allSources.filter((v) => opts.filter.test(v.title))
  : allSources;
const sources = filtered.slice(0, opts.limit);

if (opts.filter) {
  console.log(
    c.dim(`  --filter matched ${filtered.length} of ${allSources.length} videos`)
  );
}

if (sources.length === 0) {
  console.error(c.red('  ✗ No importable videos in that file.'));
  console.error(
    c.dim(
      '    Expected {videos:[{name, sourceUrl}]} from the exporter, or [{title, url}].\n' +
        '    YouTube and Vimeo entries are skipped — they are not direct media URLs.'
    )
  );
  process.exit(1);
}

// ── AWS ──────────────────────────────────────────────────────────────────────

const BUCKET = process.env.S3_BUCKET_NAME;
if (!BUCKET) {
  console.error(c.red('  ✗ S3_BUCKET_NAME is not set in server/.env'));
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const rawKeyFor = (videoId) => `uploads/raw/${videoId}/original.mp4`;

async function headObject(key) {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { exists: true, size: r.ContentLength };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') {
      return { exists: false };
    }
    throw err;
  }
}

// ── Adoption: find files already moved by hand ───────────────────────────────

/**
 * Reduce a title or S3 key to comparable word tokens.
 *
 * Wistia names arrive as `file-uploads/sites/2147965628/video/64a1685-…_VSL_1_-_MASTER.mp4`
 * while the same file uploaded by hand might be `VSL 1 - Master.mp4`. Dropping
 * the path, the extension and the hex/id noise leaves the words that actually
 * identify the video.
 */
function tokens(str, { isPath = false } = {}) {
  return String(str)
    // Only S3 keys get reduced to their basename. Doing it to a title would
    // silently truncate anything containing a slash — "Strict Parameters /
    // Legalistic Structures" would collapse to "Legalistic Structures" and
    // stop matching its own file.
    .replace(/^.*\//, (m) => (isPath ? '' : m))
    .replace(/\.[a-z0-9]{2,5}$/i, '') // extension
    // Wistia prefixes the real name with a uuid-ish run of hex groups. Strip it
    // whole rather than filtering the fragments one by one — `bb48` and `800b`
    // are indistinguishable from words once they're separated.
    .replace(/^[0-9a-f]{4,}(?:[-_][0-9a-f]{2,}){2,}[-_]?/i, '')
    // Trailing running time, e.g. `Introduction_to_Stage__1__4_15_` = 4m15s.
    // These are durations, not lesson numbers, and leaving them in wrecks the
    // numeric comparison below: `{1}` from the source would be tested against
    // `{1,4,15}` from the key and rejected as a different video. Stripped from
    // both sides so it doesn't matter which one carries the suffix.
    .replace(/_{2}\d{1,3}_\d{2}_*$/, '')
    .replace(/\s*\(\d{1,3}:\d{2}\)\s*$/, '')
    .toLowerCase()
    // Everything that isn't a letter or digit becomes a separator. S3 keys have
    // punctuation flattened to underscores while the Kajabi title keeps it, so
    // `Video:` and `Paradigm?` have to reduce to the same tokens as `Video`
    // and `Paradigm` or the two sides never line up.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    // Keep single digits: "Stage 1" vs "Stage 2" turns on exactly that
    // character, and dropping it makes two different videos look identical.
    .filter((t) => t && !/^[0-9a-f]{8,}$/i.test(t))
    .filter(Boolean);
}

const numbersIn = (set) => [...set].filter((t) => /^\d+$/.test(t)).sort().join(',');

/**
 * Sørensen–Dice over token sets: 1.0 identical, 0 nothing shared.
 *
 * With one hard override — if both names carry numbers and those numbers
 * differ, they are different videos, whatever the words around them say.
 * "Stage 1 Lesson 3" and "Stage 1 Lesson 4" share every other token and score
 * 0.86; word similarity cannot separate them, and with a half-finished
 * transfer the correct file is often missing, so there is no better candidate
 * to lose to. Numbering is the signal that actually distinguishes lessons.
 */
function similarity(title, key) {
  const A = new Set(tokens(title));
  const B = new Set(tokens(key, { isPath: true }));
  if (A.size === 0 || B.size === 0) return 0;

  const numA = numbersIn(A);
  const numB = numbersIn(B);
  if (numA && numB && numA !== numB) return 0;

  let shared = 0;
  for (const t of A) if (B.has(t)) shared += 1;
  return (2 * shared) / (A.size + B.size);
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const MAX_SINGLE_COPY = 5 * 1024 ** 3; // S3 CopyObject limit

let adoptIndex = [];
if (opts.adopt) {
  const scanBucket = opts.adoptBucket ?? BUCKET;
  process.stdout.write(c.dim(`  scanning s3://${scanBucket}/${opts.adoptPrefix} …\r`));
  let token;
  try {
    do {
      const out = await s3.send(
        new ListObjectsV2Command({
          Bucket: scanBucket,
          Prefix: opts.adoptPrefix || undefined,
          ContinuationToken: token,
          MaxKeys: 1000,
        })
      );
      for (const o of out.Contents ?? []) {
        if (!VIDEO_EXT.test(o.Key)) continue;
        // Files already at the canonical key are handled by the HeadObject check.
        // Anything under uploads/raw/ is this script's own output — a database
        // uuid or a wistia- id. Indexing it would make every source match both
        // its original and its copy, and the tie-guard would then report the
        // entire library as ambiguous on any re-run.
        if (/^uploads\/raw\//i.test(o.Key)) continue;
        adoptIndex.push({ bucket: scanBucket, key: o.Key, size: o.Size });
      }
      token = out.NextContinuationToken;
    } while (token);
  } catch (err) {
    const name = err?.name ?? '';
    console.log('');
    if (/AuthorizationHeaderMalformed|CredentialsProviderError|InvalidAccessKeyId|SignatureDoesNotMatch|Missing credentials/i.test(`${name} ${err?.message}`)) {
      console.error(
        c.red('  ✗ AWS credentials are missing or invalid.\n\n') +
          `    Fill in AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in ${c.bold('server/.env')}.\n` +
          '    An IAM user with s3:ListBucket + s3:GetObject + s3:PutObject on\n' +
          `    ${c.cyan(scanBucket)} is enough for this.\n`
      );
    } else if (/NoSuchBucket/i.test(name)) {
      console.error(
        c.red(`  ✗ No bucket "${scanBucket}" in ${process.env.AWS_REGION}.\n\n`) +
          '    Your buckets are in us-east-2 — check AWS_REGION in server/.env.\n'
      );
    } else if (/AccessDenied|Forbidden/i.test(name)) {
      console.error(
        c.red(`  ✗ Access denied listing ${scanBucket} — the IAM policy needs s3:ListBucket.\n`)
      );
    } else {
      console.error(c.red(`  ✗ Could not list ${scanBucket}: ${name} ${err?.message ?? ''}\n`));
    }
    process.exit(1);
  }
  console.log(
    c.dim(`  adoption index: ${adoptIndex.length} video files in s3://${scanBucket}/${opts.adoptPrefix}`)
  );
}

/** How far ahead the winner must be before we trust it over the runner-up. */
const AMBIGUITY_MARGIN = 0.15;

/**
 * Best-scoring existing object for a source.
 *
 * Returns `{ambiguous: true}` rather than a match when the top two candidates
 * score within a hair of each other — "Lesson 1" and "Lesson 2" differ by one
 * token, and adopting the wrong one silently attaches the wrong video to a
 * lesson. A near-tie is reported for a human to resolve, never guessed.
 */
function findExisting(src) {
  if (adoptIndex.length === 0) return null;

  const scored = [];
  for (const cand of adoptIndex) {
    if (cand.claimed) continue;
    let score = similarity(src.title, cand.key);
    // An exact byte-size match is strong corroboration on its own.
    if (src.expectedBytes && cand.size === src.expectedBytes) score = Math.max(score, 0.95);
    scored.push({ ...cand, score });
  }
  if (scored.length === 0) return null;

  scored.sort((a, b) => b.score - a.score);
  const [best, runnerUp] = scored;

  if (best.score < opts.matchThreshold) return null;
  if (runnerUp && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
    return { ambiguous: true, candidates: scored.slice(0, 3) };
  }
  return best;
}

// ── Database ─────────────────────────────────────────────────────────────────

const dbConfigured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

// A dry run answers "what is already in S3 and what still has to come down".
// That is an S3 question, so don't force Supabase to be configured to ask it —
// the database only matters once rows are actually being written.
// Without Supabase the files can still be moved — they just key off the Wistia
// id instead of a database row. That matters because getting the bytes out of
// Kajabi is the deadline-bound half; wiring them to courses is not, and can be
// done later by matching `uploads/raw/wistia-<id>/` back to a video row.
const noDb = !dbConfigured;
if (noDb) {
  console.log(
    c.dim(
      opts.dryRun
        ? '  Supabase not configured — planning against S3 only'
        : '  Supabase not configured — keying files by Wistia id (uploads/raw/wistia-<id>/)'
    )
  );
}
const dryRunWithoutDb = noDb;

let courseId = null;
if (opts.course && !dryRunWithoutDb) {
  const course = unwrap(
    await db().from('courses').select('id, title').eq('slug', opts.course).maybeSingle(),
    'load course'
  );
  if (!course) {
    console.error(c.red(`  ✗ No course with slug "${opts.course}"`));
    process.exit(1);
  }
  courseId = course.id;
  console.log(c.dim(`  attaching to course: ${course.title}`));
}

/** Reuse the row for a title if it already exists, so re-runs don't duplicate. */
async function findOrCreateVideo(src, position) {
  if (noDb) {
    // Stable, derived from the source rather than a database row, so re-runs
    // land on the same key and the HeadObject skip still works.
    return {
      id: src.sourceId ? `wistia-${src.sourceId}` : `n${position + 1}`,
      title: src.title,
      created: false,
    };
  }

  const matches = unwrap(
    await db().from('videos').select('id, title, s3_key, transcode_status').eq('title', src.title),
    'find video'
  );

  if (matches.length > 1) {
    throw new Error(
      `${matches.length} existing videos are titled "${src.title}" — ` +
        'rename them so this can attach to the right one'
    );
  }
  if (matches.length === 1) return { ...matches[0], created: false };

  if (opts.dryRun) return { id: '(new)', title: src.title, created: true };

  const row = unwrap(
    await db()
      .from('videos')
      .insert({
        title: src.title,
        description: src.description ?? '',
        duration_seconds: src.durationSeconds,
        access_type: opts.accessType,
        course_id: courseId,
        position,
        is_published: false,
      })
      .select('id, title, s3_key, transcode_status')
      .single(),
    'create video'
  );
  return { ...row, created: true };
}

/** Kick off transcoding and/or publish, once the source is in place. */
async function runFollowUps(video) {
  if (noDb) return; // nothing to update, and transcoding needs a row to point at
  const patch = {};
  if (opts.transcode) {
    const jobId = await submitTranscodeJob(video.id);
    patch.transcode_status = 'processing';
    patch.transcode_job_id = jobId;
    patch.s3_key = hlsKeyFor(video.id);
    console.log(c.dim(`        transcode job ${jobId}`));
  }
  if (opts.publish) patch.is_published = true;
  if (Object.keys(patch).length === 0) return;

  unwrap(
    await db().from('videos').update(patch).eq('id', video.id).select('id').single(),
    'update video'
  );
}

// ── Disk guard ───────────────────────────────────────────────────────────────

async function freeBytes(dir) {
  try {
    const st = await fs.statfs(dir);
    return st.bavail * st.bsize;
  } catch {
    return Infinity; // statfs unavailable — don't block on it
  }
}

// ── Import one ───────────────────────────────────────────────────────────────

await fs.mkdir(opts.tmpDir, { recursive: true });

console.log(`
${c.bold('Importing videos to S3')}

  bucket    ${BUCKET}
  staging   ${opts.tmpDir}
  videos    ${sources.length}${opts.dryRun ? c.yellow('   (dry run — nothing will be written)') : ''}
`);

const results = [];
let uploadedBytes = 0;

for (const [i, src] of sources.entries()) {
  const n = `${String(i + 1).padStart(3)}/${sources.length}`;
  let staged = null;

  try {
    const video = await findOrCreateVideo(src, i);
    const key = rawKeyFor(video.id);

    // ── already there? ────────────────────────────────────────────────────
    if (!opts.force && !opts.dryRun) {
      const head = await headObject(key);
      if (head.exists && (!src.expectedBytes || head.size === src.expectedBytes)) {
        console.log(
          `  ${c.dim('·')} ${n} ${src.title} ${c.dim(`already in S3 (${bytes(head.size)}) — skipped`)}`
        );
        results.push({ ...src, id: video.id, key, skipped: 'already-in-s3', size: head.size });
        continue;
      }
      if (head.exists) {
        console.log(
          c.yellow(
            `  ! ${n} ${src.title} — in S3 at ${bytes(head.size)} but source is ` +
              `${bytes(src.expectedBytes)}; re-uploading`
          )
        );
      }
    }

    // ── already in the bucket under another name? ─────────────────────────
    const match = opts.force ? null : findExisting(src);

    if (match?.ambiguous) {
      console.log(
        c.yellow(`  ? ${n} ${src.title} — too close to call, not adopted:`) +
          '\n' +
          match.candidates
            .map((x) => c.dim(`        ${x.score.toFixed(2)}  ${x.key}`))
            .join('\n')
      );
      results.push({
        ...src,
        id: video.id,
        key,
        ambiguous: match.candidates.map((x) => ({ key: x.key, score: x.score })),
      });
      continue;
    }

    if (match) {
      match.claimed = true; // one existing file can only satisfy one source

      if (opts.dryRun) {
        console.log(
          `  ${c.cyan('⧉')} ${n} ${src.title}\n` +
            c.dim(`        adopt s3://${match.bucket}/${match.key}\n`) +
            c.dim(`        ${bytes(match.size)} · confidence ${match.score.toFixed(2)} · server-side copy, no download`)
        );
        results.push({ ...src, id: video.id, key, adoptFrom: match.key, score: match.score, planned: true });
        continue;
      }

      if (match.size > MAX_SINGLE_COPY) {
        console.log(
          c.yellow(`  ! ${n} ${src.title} — ${bytes(match.size)} exceeds the 5GB copy limit; downloading instead`)
        );
      } else {
        await s3.send(
          new CopyObjectCommand({
            Bucket: BUCKET,
            Key: key,
            // CopySource must be URL-encoded, but the slashes stay literal.
            CopySource: encodeURIComponent(`${match.bucket}/${match.key}`).replace(/%2F/g, '/'),
            ContentType: 'video/mp4',
            MetadataDirective: 'REPLACE',
          })
        );

        const copied = await headObject(key);
        if (!copied.exists || copied.size !== match.size) {
          throw new Error(
            `copy verification failed — source ${bytes(match.size)}, ` +
              `destination ${copied.exists ? bytes(copied.size) : 'missing'}`
          );
        }

        console.log(
          `  ${c.green('⧉')} ${n} ${src.title} ` +
            c.dim(`adopted ${match.key} (${bytes(match.size)}, conf ${match.score.toFixed(2)})`)
        );
        results.push({ ...src, id: video.id, key, adoptedFrom: match.key, size: match.size, score: match.score });

        await runFollowUps(video);
        continue;
      }
    }

    if (opts.dryRun) {
      console.log(
        `  ${c.cyan('▸')} ${n} ${src.title} ${c.dim(`→ s3://${BUCKET}/${key}`)}` +
          `${video.created ? c.dim(' (new row)') : ''}` +
          c.dim('  download + upload')
      );
      results.push({ ...src, id: video.id, key, planned: true });
      continue;
    }

    // ── download ──────────────────────────────────────────────────────────
    staged = path.join(opts.tmpDir, `${video.id}.mp4`);

    if (src.localPath && (await fs.access(src.localPath).then(() => true, () => false))) {
      staged = path.resolve(src.localPath); // already on disk — upload in place
    } else {
      const need = src.expectedBytes ?? 2 * 1024 ** 3;
      const free = await freeBytes(opts.tmpDir);
      if (free < need * 1.1) {
        throw new Error(
          `not enough free space in ${opts.tmpDir}: need ~${bytes(need)}, have ${bytes(free)}`
        );
      }

      // Multi-gigabyte transfers get cut mid-stream often enough that a single
      // attempt is not good enough — Node surfaces that as a bare "terminated".
      // Retry with backoff, and start the file over each time: a partial write
      // is not resumable here, so appending would silently corrupt it.
      const ATTEMPTS = 4;
      let lastErr;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        try {
          process.stdout.write(
            `  ${c.dim('↓')} ${n} ${src.title} ` +
              `${c.dim(attempt === 1 ? 'downloading…' : `downloading… (attempt ${attempt}/${ATTEMPTS})`)}\r`
          );
          const res = await fetch(src.url, { redirect: 'follow' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await pipeline(Readable.fromWeb(res.body), createWriteStream(staged));

          if (src.expectedBytes) {
            const got = (await fs.stat(staged)).size;
            if (got !== src.expectedBytes) {
              throw new Error(`truncated — got ${bytes(got)} of ${bytes(src.expectedBytes)}`);
            }
          }
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          await fs.rm(staged, { force: true }).catch(() => {});
          if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
      if (lastErr) throw new Error(`download failed after ${ATTEMPTS} attempts — ${lastErr.message}`);
    }

    const stat = await fs.stat(staged);
    if (stat.size === 0) throw new Error('downloaded file is empty');

    // ── upload ────────────────────────────────────────────────────────────
    process.stdout.write(
      `  ${c.dim('↑')} ${n} ${src.title} ${c.dim(`uploading ${bytes(stat.size)}…`)}\r`
    );

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: BUCKET,
        Key: key,
        Body: createReadStream(staged),
        ContentType: 'video/mp4',
      },
      queueSize: 4,
      partSize: 16 * 1024 * 1024,
    });
    await upload.done();

    // ── verify ────────────────────────────────────────────────────────────
    const check = await headObject(key);
    if (!check.exists || check.size !== stat.size) {
      throw new Error(
        `upload verification failed — local ${bytes(stat.size)}, ` +
          `S3 ${check.exists ? bytes(check.size) : 'missing'}`
      );
    }

    uploadedBytes += stat.size;
    console.log(
      `  ${c.green('✓')} ${n} ${src.title} ${c.dim(`${bytes(stat.size)} → ${key}`)}          `
    );

    await runFollowUps(video);

    results.push({ ...src, id: video.id, key, size: stat.size, uploaded: true });
  } catch (err) {
    console.log(`  ${c.red('✗')} ${n} ${src.title} — ${String(err.message ?? err)}          `);
    results.push({ ...src, failed: true, error: String(err.message ?? err) });
  } finally {
    // The whole point of this script: never leave the file behind. Runs on the
    // success path and on every failure path alike.
    if (staged && !opts.keepLocal && !src.localPath) {
      await fs.rm(staged, { force: true }).catch(() => {});
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

const uploaded = results.filter((r) => r.uploaded);
// `adoptedFrom` is set by a real copy, `adoptFrom` by a dry run's plan. Count
// both, or a dry run reports "adopted 0" while listing hundreds of adoptions.
const adopted = results.filter((r) => r.adoptedFrom || r.adoptFrom);
const skipped = results.filter((r) => r.skipped);
const failed = results.filter((r) => r.failed);
const ambiguous = results.filter((r) => r.ambiguous);
const toDownload = results.filter(
  (r) => !r.adoptedFrom && !r.adoptFrom && !r.skipped && !r.ambiguous && !r.failed
);
const toDownloadBytes = toDownload.reduce((n, r) => n + (r.expectedBytes ?? 0), 0);

const logPath = path.join(SERVER_ROOT, 'scripts', 'import-videos.log.json');
await fs.writeFile(
  logPath,
  JSON.stringify({ ranAt: new Date().toISOString(), bucket: BUCKET, opts, results }, null, 2)
);

console.log(`
${failed.length === 0 ? c.green(c.bold('Import complete')) : c.yellow(c.bold('Import finished with errors'))}

  ${opts.dryRun ? 'to download' : 'uploaded  '} ${(opts.dryRun ? toDownload.length : uploaded.length).toString().padEnd(4)} ${c.dim(
    opts.dryRun
      ? `${bytes(toDownloadBytes)} to pull from source`
      : `${bytes(uploadedBytes)} downloaded from source`
  )}
  adopted    ${String(adopted.length).padEnd(4)} ${c.dim('already in S3 under another name — server-side copy, no egress')}
  skipped    ${String(skipped.length).padEnd(4)} ${c.dim('already at the canonical key')}
  ambiguous  ${String(ambiguous.length).padEnd(4)} ${c.dim('too close to call — resolve by hand')}
  failed     ${String(failed.length).padEnd(4)}
  log        ${path.relative(process.cwd(), logPath)}
${
  failed.length > 0
    ? `\n${failed.map((f) => `  ${c.red('✗')} ${f.title} — ${f.error}`).join('\n')}\n`
    : ''
}${
  opts.dryRun
    ? c.yellow('\n  Dry run — nothing was downloaded, uploaded or written.\n')
    : ''
}`);

// Leftovers from a previous crash, if any.
const leftovers = await fs.readdir(opts.tmpDir).catch(() => []);
if (leftovers.length > 0 && !opts.keepLocal) {
  console.log(c.yellow(`  ! ${leftovers.length} stale file(s) in ${opts.tmpDir} — safe to delete.`));
}

process.exit(failed.length > 0 ? 1 : 0);
