/**
 * Rebuilds the Kajabi programs inside the platform database, and points each
 * video row at the file already sitting in S3.
 *
 * Reads two artefacts produced by the exporter:
 *   programs.json      program → module → lesson, rebuilt from lesson URLs
 *   videos/index.json  wistia id → title, duration, size
 *
 * and for each program:
 *   1. finds or creates the course
 *   2. finds or creates its modules, in order
 *   3. finds or creates a video row per lesson, linked to course + module
 *   4. server-side copies uploads/raw/wistia-<id>/original.mp4 to
 *      uploads/raw/<videoId>/original.mp4, the key MediaConvert expects
 *
 * Everything keys off `source_wistia_id` and `modules.source_ref`, so running
 * it twice updates in place instead of duplicating.
 *
 *   node scripts/link-videos.js --dry-run
 *   node scripts/link-videos.js
 *   node scripts/link-videos.js --program get-unstuck-in-life-... --publish
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { S3Client, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

// Talks to Postgres directly rather than through PostgREST. This is a bulk
// load — ~1,300 statements — and one transaction over one connection is both
// faster and atomic, where the REST client would be that many round trips with
// no way to roll back a half-finished import.
const { default: pg } = await import('pg');
const dbConfigured = Boolean(process.env.DATABASE_URL);
let sql = null; // set below once connected

// ── Args ─────────────────────────────────────────────────────────────────────

const args = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) args[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const next = argv[i + 1];
      args[a.slice(2)] = next && !next.startsWith('--') ? (i += 1, next) : true;
    }
  }
}

const EXPORT_DIR = path.resolve(
  args.export ?? path.join(SERVER_ROOT, '..', 'tools', 'kajabi-export', 'export')
);

const opts = {
  dryRun: Boolean(args['dry-run']),
  program: args.program ?? null,
  publish: Boolean(args.publish),
  price: args.price ? Number(args.price) : 0,
  skipS3: Boolean(args['skip-s3-copy']),
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const readJson = async (p, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
};

// ── Inputs ───────────────────────────────────────────────────────────────────

const programsFile = await readJson(path.join(EXPORT_DIR, 'programs.json'));
const videoIndex = await readJson(path.join(EXPORT_DIR, 'videos', 'index.json'));

if (!programsFile?.programs?.length) {
  console.error(
    c.red(`  ✗ No programs.json under ${EXPORT_DIR}\n`) +
      c.dim('    Run the exporter first: node crawl.js && node report.js\n')
  );
  process.exit(1);
}
if (!videoIndex?.videos?.length) {
  console.error(c.red(`  ✗ No videos/index.json under ${EXPORT_DIR}\n`));
  process.exit(1);
}

/** wistia id → what the exporter learned about that media. */
const mediaById = new Map(
  videoIndex.videos.filter((v) => v.provider === 'wistia').map((v) => [v.id, v])
);

/**
 * The course title. The lesson pages all share the site name as <title>, but
 * the product page's first heading is the program's real name.
 */
async function courseTitleFor(slug) {
  const page = await readJson(path.join(EXPORT_DIR, 'pages', `products__${slug}`, 'page.json'));
  const heading = (page?.headings ?? []).map((h) => h.text).find((t) => t && t.length > 3);
  if (heading) return heading.replace(/\s+/g, ' ').trim().slice(0, 200);
  // Fall back to a readable form of the slug.
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()).slice(0, 200);
}

// ── AWS ──────────────────────────────────────────────────────────────────────

const BUCKET = process.env.S3_BUCKET_NAME;
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-2',
  ...(process.env.AWS_ACCESS_KEY_ID
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

const rawKeyFor = (id) => `uploads/raw/${id}/original.mp4`;

async function head(key) {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { exists: true, size: r.ContentLength };
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return { exists: false };
    throw err;
  }
}

/**
 * Move the file from its wistia-keyed location to the id-keyed one the
 * transcode step expects. Server-side, so no bytes leave S3.
 */
async function placeAtCanonicalKey(wistiaId, videoId) {
  if (opts.skipS3 || !BUCKET) return { skipped: true };
  const from = rawKeyFor(`wistia-${wistiaId}`);
  const to = rawKeyFor(videoId);

  const dest = await head(to);
  const src = await head(from);
  if (dest.exists && (!src.exists || dest.size === src.size)) return { already: true };
  if (!src.exists) return { missing: true, from };

  await s3.send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      Key: to,
      CopySource: encodeURIComponent(`${BUCKET}/${from}`).replace(/%2F/g, '/'),
      ContentType: 'video/mp4',
      MetadataDirective: 'REPLACE',
    })
  );
  return { copied: true, bytes: src.size };
}

// ── Upserts ──────────────────────────────────────────────────────────────────

const planOnly = opts.dryRun && !dbConfigured;

async function upsertCourse(slug, title) {
  if (planOnly) return { id: `(course ${slug})`, slug, title, created: true };
  const { rows } = await sql.query(
    `insert into public.courses (slug, title, description, price, is_published)
       values ($1, $2, '', $3, $4)
     on conflict (slug) do update set title = excluded.title
     returning id, slug, title, (xmax = 0) as created`,
    [slug, title, opts.price, opts.publish]
  );
  return rows[0];
}

async function upsertModule(courseId, sourceRef, title, position) {
  if (planOnly) return { id: `(module ${sourceRef})`, title, created: true };
  const { rows } = await sql.query(
    `insert into public.modules (course_id, source_ref, title, position)
       values ($1, $2, $3, $4)
     on conflict (course_id, source_ref) where source_ref is not null
       do update set title = excluded.title, position = excluded.position
     returning id, title, (xmax = 0) as created`,
    [courseId, sourceRef, title, position]
  );
  return rows[0];
}

async function upsertVideo({ wistiaId, title, courseId, moduleId, position, durationSeconds }) {
  if (planOnly) return { id: `(video ${wistiaId})`, title, created: true };
  const { rows } = await sql.query(
    `insert into public.videos
       (source_wistia_id, title, course_id, module_id, position,
        duration_seconds, access_type, is_published)
       values ($1, $2, $3, $4, $5, $6, 'course', $7)
     on conflict (source_wistia_id) where source_wistia_id is not null
       do update set title            = excluded.title,
                     course_id        = excluded.course_id,
                     module_id        = excluded.module_id,
                     position         = excluded.position,
                     duration_seconds = excluded.duration_seconds
     returning id, title, (xmax = 0) as created`,
    [wistiaId, title, courseId, moduleId, position, durationSeconds ?? null, opts.publish]
  );
  return rows[0];
}

// ── Run ──────────────────────────────────────────────────────────────────────

const programs = opts.program
  ? programsFile.programs.filter((p) => p.slug.includes(opts.program))
  : programsFile.programs;

if (programs.length === 0) {
  console.error(c.red(`  ✗ No program matching "${opts.program}"`));
  process.exit(1);
}

if (!planOnly) {
  if (!dbConfigured) {
    console.error(c.red('  ✗ DATABASE_URL is not set in server/.env\n'));
    process.exit(1);
  }
  sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await sql.connect();
  await sql.query('begin');
}

console.log(`
${c.bold('Linking programs into the database')}
${opts.dryRun ? c.yellow('  DRY RUN — nothing will be written\n') : ''}${
  planOnly ? c.dim('  Supabase not configured — planning from the export files only\n') : ''
}`);

const stats = {
  courses: 0, modules: 0, videos: 0, updated: 0,
  textLessons: 0, missingMedia: 0, s3Copied: 0, s3Missing: 0,
};
const problems = [];

for (const program of programs) {
  const title = await courseTitleFor(program.slug);
  const course = await upsertCourse(program.slug, title);
  stats.courses += course.created ? 1 : 0;

  console.log(
    `${c.cyan('▸')} ${c.bold(title.slice(0, 70))}\n` +
      c.dim(`   ${program.slug}\n`) +
      c.dim(`   ${program.modules.length} modules · ${program.lessonCount} lessons · ${program.videoCount} videos`)
  );

  let videoPosition = 0;

  for (const [mi, mod] of program.modules.entries()) {
    const moduleTitle = (mod.name ?? `Module ${mi + 1}`).replace(/\s+/g, ' ').trim().slice(0, 200);
    const record = await upsertModule(course.id, String(mod.id), moduleTitle, mi);
    stats.modules += record.created ? 1 : 0;

    for (const [li, lesson] of mod.lessons.entries()) {
      // The devotional's lessons are written content, not video. The schema has
      // nowhere to put a lesson body, so they are counted and reported rather
      // than quietly dropped.
      if (!lesson.videos || lesson.videos.length === 0) {
        stats.textLessons += 1;
        continue;
      }

      for (const ref of lesson.videos) {
        const [provider, wistiaId] = ref.split(':');
        if (provider !== 'wistia') continue;

        const media = mediaById.get(wistiaId);
        if (!media) {
          stats.missingMedia += 1;
          problems.push(`no media entry for ${wistiaId} (${lesson.title})`);
          continue;
        }

        const video = await upsertVideo({
          wistiaId,
          title: (lesson.title ?? media.lessonTitle ?? media.name ?? wistiaId).slice(0, 300),
          courseId: course.id,
          moduleId: record.id,
          position: videoPosition,
          durationSeconds: media.duration ? Math.round(media.duration) : null,
        });
        videoPosition += 1;
        if (video.created) stats.videos += 1;
        else stats.updated += 1;

        if (!opts.dryRun) {
          const placed = await placeAtCanonicalKey(wistiaId, video.id);
          if (placed.copied) stats.s3Copied += 1;
          if (placed.missing) {
            stats.s3Missing += 1;
            problems.push(`S3 object missing: ${placed.from} (${lesson.title})`);
          }
        }
      }
    }
  }
  console.log(
    c.dim(`   → ${program.modules.length} modules, ${videoPosition} videos linked\n`)
  );
}

console.log(`${c.green(c.bold('Done'))}

  courses created   ${stats.courses}
  modules created   ${stats.modules}
  videos created    ${stats.videos}
  videos updated    ${stats.updated}
  s3 files placed   ${stats.s3Copied}${opts.skipS3 ? c.dim(' (skipped)') : ''}

  ${stats.textLessons > 0 ? c.yellow(`text-only lessons  ${stats.textLessons}  — no video, and the schema has nowhere to store a lesson body`) : ''}
  ${stats.missingMedia > 0 ? c.yellow(`missing media      ${stats.missingMedia}`) : ''}
  ${stats.s3Missing > 0 ? c.red(`missing in S3      ${stats.s3Missing}`) : ''}
${
  problems.length > 0
    ? `\n${c.dim('first problems:')}\n` + problems.slice(0, 10).map((p) => `  · ${p}`).join('\n') + '\n'
    : ''
}${opts.dryRun ? c.yellow('\n  Dry run — nothing was written.\n') : ''}`);

if (sql) {
  // Commit only if the whole import got here — a partial course/module tree is
  // worse than none, since the next run would build on top of it.
  await sql.query(opts.dryRun ? 'rollback' : 'commit');
  await sql.end();
}
