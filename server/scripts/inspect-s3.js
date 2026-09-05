/**
 * Reports what is actually in the S3 bucket, and how it lines up with the
 * `videos` table.
 *
 * Answers the questions that decide whether a video migration is a re-upload
 * or a cheap key remap:
 *   - which key conventions are in use, and how many objects follow each
 *   - which `videos` rows have no object behind them  (broken playback)
 *   - which objects have no row pointing at them      (orphans / old build)
 *
 *   node scripts/inspect-s3.js                 # bucket from server/.env
 *   node scripts/inspect-s3.js --bucket other-bucket --prefix lessons/
 *   node scripts/inspect-s3.js --list-buckets  # if you're not sure of the name
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  S3Client,
  ListObjectsV2Command,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const args = {};
for (let i = 0; i < process.argv.slice(2).length; i += 1) {
  const argv = process.argv.slice(2);
  const a = argv[i];
  if (!a?.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq !== -1) args[a.slice(2, eq)] = a.slice(eq + 1);
  else {
    const next = argv[i + 1];
    args[a.slice(2)] = next && !next.startsWith('--') ? (i += 1, next) : true;
  }
}

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

const s3 = new S3Client({
  region: args.region ?? process.env.AWS_REGION ?? 'us-east-1',
  ...(process.env.AWS_ACCESS_KEY_ID
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}), // fall back to the default provider chain (~/.aws, SSO, instance role)
});

// ── Just list the buckets ────────────────────────────────────────────────────

if (args['list-buckets']) {
  const out = await s3.send(new ListBucketsCommand({}));
  console.log(`\n${c.bold('Buckets')}\n`);
  for (const b of out.Buckets ?? []) {
    console.log(`  ${b.Name}  ${c.dim(b.CreationDate?.toISOString().slice(0, 10) ?? '')}`);
  }
  console.log(`\n  Re-run with ${c.bold('--bucket <name>')} to inspect one.\n`);
  process.exit(0);
}

const BUCKET = args.bucket ?? process.env.S3_BUCKET_NAME ?? process.env.AWS_S3_BUCKET;
if (!BUCKET) {
  console.error(
    c.red('  ✗ No bucket.\n') +
      c.dim(
        '    Set S3_BUCKET_NAME in server/.env, pass --bucket <name>,\n' +
          '    or run --list-buckets to see what this account can reach.\n'
      )
  );
  process.exit(1);
}

// ── Walk the bucket ──────────────────────────────────────────────────────────

console.log(`\n${c.bold('Inspecting')} ${c.cyan(`s3://${BUCKET}/${args.prefix ?? ''}`)}\n`);

const objects = [];
let token;
let pages = 0;
try {
  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: args.prefix || undefined,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    );
    for (const o of out.Contents ?? []) {
      objects.push({ key: o.Key, size: o.Size, modified: o.LastModified });
    }
    token = out.NextContinuationToken;
    pages += 1;
    if (pages % 5 === 0) process.stdout.write(c.dim(`  …${objects.length} objects\r`));
  } while (token);
} catch (err) {
  const name = err?.name ?? '';
  if (/NoSuchBucket/i.test(name)) {
    console.error(c.red(`  ✗ No bucket named "${BUCKET}" in this region/account.`));
  } else if (/AccessDenied|Forbidden/i.test(name)) {
    console.error(c.red(`  ✗ Access denied listing "${BUCKET}" — check the IAM policy.`));
  } else if (/CredentialsProviderError|InvalidAccessKeyId|SignatureDoesNotMatch/i.test(name)) {
    console.error(
      c.red('  ✗ AWS credentials are missing or invalid.\n') +
        c.dim('    Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in server/.env.\n')
    );
  } else {
    console.error(c.red(`  ✗ ${name}: ${err.message}`));
  }
  process.exit(1);
}

if (objects.length === 0) {
  console.log(c.yellow('  The bucket is empty (or the prefix matched nothing).\n'));
  process.exit(0);
}

// ── Classify by key convention ───────────────────────────────────────────────

const CONVENTIONS = [
  {
    id: 'current-raw',
    label: 'uploads/raw/<id>/original.mp4',
    note: 'current platform — source uploads',
    re: /^uploads\/raw\/([0-9a-f-]{36})\/original\.\w+$/i,
  },
  {
    id: 'current-hls',
    label: 'videos/hls/<id>/…',
    note: 'current platform — transcoded output',
    re: /^videos\/hls\/([0-9a-f-]{36})\//i,
  },
  {
    id: 'old-kajabi-build',
    label: 'lessons/<lessonId>/<timestamp>.<ext>',
    note: 'the abandoned ~/CODE/jd/kajabi build',
    re: /^lessons\/([^/]+)\/\d+\.\w+$/i,
  },
];

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|m3u8|ts)$/i;

const byConvention = new Map();
for (const conv of CONVENTIONS) byConvention.set(conv.id, { ...conv, objects: [], bytes: 0 });
byConvention.set('other', { id: 'other', label: 'everything else', note: '', objects: [], bytes: 0 });

for (const o of objects) {
  const conv = CONVENTIONS.find((x) => x.re.test(o.key));
  const slot = byConvention.get(conv?.id ?? 'other');
  slot.objects.push(o);
  slot.bytes += o.size;
  o.convention = conv?.id ?? 'other';
  o.entityId = conv ? o.key.match(conv.re)?.[1] : null;
}

const totalBytes = objects.reduce((n, o) => n + o.size, 0);
const videoObjects = objects.filter((o) => VIDEO_EXT.test(o.key));

console.log(`${c.bold('Contents')}                                                   \n`);
console.log(`  objects   ${objects.length}`);
console.log(`  size      ${bytes(totalBytes)}`);
console.log(`  video     ${videoObjects.length} files, ${bytes(videoObjects.reduce((n, o) => n + o.size, 0))}\n`);

console.log(`${c.bold('Key conventions')}\n`);
for (const slot of byConvention.values()) {
  if (slot.objects.length === 0) continue;
  console.log(
    `  ${String(slot.objects.length).padStart(5)}  ${bytes(slot.bytes).padStart(8)}  ` +
      `${slot.label}${slot.note ? c.dim(`  — ${slot.note}`) : ''}`
  );
}

// Top-level prefixes, for anything that didn't match a known convention.
const otherSlot = byConvention.get('other');
if (otherSlot.objects.length > 0) {
  const prefixes = new Map();
  for (const o of otherSlot.objects) {
    const p = o.key.includes('/') ? `${o.key.split('/')[0]}/` : '(root)';
    const e = prefixes.get(p) ?? { n: 0, bytes: 0 };
    e.n += 1;
    e.bytes += o.size;
    prefixes.set(p, e);
  }
  console.log(`\n${c.bold('Unrecognised prefixes')}\n`);
  for (const [p, e] of [...prefixes.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 20)) {
    console.log(`  ${String(e.n).padStart(5)}  ${bytes(e.bytes).padStart(8)}  ${p}`);
  }
}

console.log(`\n${c.bold('Largest objects')}\n`);
for (const o of [...objects].sort((a, b) => b.size - a.size).slice(0, 15)) {
  console.log(`  ${bytes(o.size).padStart(8)}  ${c.dim(o.modified?.toISOString().slice(0, 10))}  ${o.key}`);
}

// ── Cross-reference the videos table ─────────────────────────────────────────

let dbReport = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { db, unwrap } = await import('../src/config/supabase.js');
  const rows = unwrap(
    await db().from('videos').select('id, title, s3_key, transcode_status, is_published'),
    'list videos'
  );

  const rawIds = new Set(
    byConvention.get('current-raw').objects.map((o) => o.entityId).filter(Boolean)
  );
  const hlsIds = new Set(
    byConvention.get('current-hls').objects.map((o) => o.entityId).filter(Boolean)
  );

  const missingSource = rows.filter((r) => !rawIds.has(r.id));
  const missingHls = rows.filter((r) => r.s3_key && !hlsIds.has(r.id));
  const orphanRaw = [...rawIds].filter((id) => !rows.some((r) => r.id === id));

  dbReport = { total: rows.length, missingSource, missingHls, orphanRaw };

  console.log(`\n${c.bold('Against the videos table')} ${c.dim(`(${rows.length} rows)`)}\n`);
  console.log(
    `  ${missingSource.length === 0 ? c.green('✓') : c.yellow('!')} ` +
      `${missingSource.length} rows with no source upload in S3`
  );
  console.log(
    `  ${missingHls.length === 0 ? c.green('✓') : c.yellow('!')} ` +
      `${missingHls.length} rows pointing at HLS output that isn't there ${c.dim('(playback broken)')}`
  );
  console.log(
    `  ${orphanRaw.length === 0 ? c.green('✓') : c.yellow('!')} ` +
      `${orphanRaw.length} uploads in S3 with no row`
  );

  for (const r of missingHls.slice(0, 10)) {
    console.log(c.dim(`      broken: ${r.title} (${r.id})`));
  }
} else {
  console.log(
    c.dim('\n  Supabase not configured — skipped the videos-table cross-reference.\n')
  );
}

// ── Save ─────────────────────────────────────────────────────────────────────

const outPath = path.join(SERVER_ROOT, 'scripts', 'inspect-s3.report.json');
await fs.writeFile(
  outPath,
  JSON.stringify(
    {
      bucket: BUCKET,
      scannedAt: new Date().toISOString(),
      totals: { objects: objects.length, bytes: totalBytes, videoFiles: videoObjects.length },
      conventions: [...byConvention.values()].map((s) => ({
        id: s.id,
        label: s.label,
        count: s.objects.length,
        bytes: s.bytes,
      })),
      objects,
      db: dbReport,
    },
    null,
    2
  )
);

console.log(`
${c.green('Done')} — full listing written to ${c.dim(path.relative(process.cwd(), outPath))}

${c.dim('If most video sits under lessons/, the migration is an S3-to-S3 copy plus')}
${c.dim('DB rows — not a re-download from Wistia.')}
`);
