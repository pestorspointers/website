/**
 * Creates the two AWS pieces the video pipeline is missing, and writes the
 * values it discovers into server/.env.
 *
 *   1. an IAM role MediaConvert can assume, scoped to this bucket only
 *   2. a CORS rule on the bucket so the admin browser can PUT uploads
 *   3. MEDIACONVERT_ENDPOINT / CLOUDFRONT_DOMAIN / CLOUDFRONT_KEY_PAIR_ID
 *
 * Everything here is free and reversible. It does NOT start any transcode —
 * that costs money per minute of video and is a separate, deliberate step.
 *
 *   node scripts/aws-setup.js --dry-run
 *   node scripts/aws-setup.js
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';
import { MediaConvertClient, DescribeEndpointsCommand } from '@aws-sdk/client-mediaconvert';
import {
  IAMClient, CreateRoleCommand, PutRolePolicyCommand, GetRoleCommand,
} from '@aws-sdk/client-iam';
import { CloudFrontClient, ListDistributionsCommand, ListPublicKeysCommand } from '@aws-sdk/client-cloudfront';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(SERVER_ROOT, '.env');
dotenv.config({ path: ENV_PATH });

const dryRun = process.argv.includes('--dry-run');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const REGION = process.env.AWS_REGION || 'us-east-2';
const BUCKET = process.env.S3_BUCKET_NAME;
const ROLE_NAME = 'PestorsMediaConvertRole';
const creds = {
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

const s3 = new S3Client({ region: REGION, ...creds });
const iam = new IAMClient({ region: REGION, ...creds });
const cf = new CloudFrontClient({ region: REGION, ...creds });

const discovered = {};
console.log(`\n${c.bold('AWS setup')}${dryRun ? c.yellow('  (dry run)') : ''}\n`);

// ── 1. MediaConvert role ─────────────────────────────────────────────────────

// MediaConvert reads the source and writes the HLS renditions back. Scoped to
// this one bucket rather than a blanket S3 policy — the job only ever touches
// uploads/raw and videos/hls.
const TRUST = {
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { Service: 'mediaconvert.amazonaws.com' },
    Action: 'sts:AssumeRole',
  }],
};

const PERMISSIONS = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'ReadSourcesWriteRenditions',
      Effect: 'Allow',
      Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
      Resource: [`arn:aws:s3:::${BUCKET}/uploads/*`, `arn:aws:s3:::${BUCKET}/videos/*`],
    },
    {
      Sid: 'ListTheBucket',
      Effect: 'Allow',
      Action: ['s3:ListBucket', 's3:GetBucketLocation'],
      Resource: `arn:aws:s3:::${BUCKET}`,
    },
  ],
};

let roleArn = null;
try {
  const existing = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
  roleArn = existing.Role.Arn;
  console.log(`  ${c.dim('·')} role ${ROLE_NAME} already exists`);
} catch (err) {
  if (err.name !== 'NoSuchEntityException') throw err;
  if (dryRun) {
    console.log(`  ${c.cyan('▸')} would create role ${ROLE_NAME}`);
  } else {
    const created = await iam.send(new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify(TRUST),
      Description: 'Lets MediaConvert read source uploads and write HLS renditions for the course platform.',
    }));
    roleArn = created.Role.Arn;
    console.log(`  ${c.green('✓')} created role ${ROLE_NAME}`);
  }
}

if (roleArn && !dryRun) {
  await iam.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: 'CourseVideoBucketAccess',
    PolicyDocument: JSON.stringify(PERMISSIONS),
  }));
  console.log(`  ${c.green('✓')} policy attached — ${BUCKET} only, uploads/* and videos/*`);
  discovered.MEDIACONVERT_ROLE_ARN = roleArn;
}

// ── 2. Bucket CORS ───────────────────────────────────────────────────────────

// Needed for the admin's presigned PUT: the browser uploads straight to S3, so
// S3 itself has to allow the site's origin.
const ORIGINS = [
  process.env.CLIENT_URL || 'http://localhost:3000',
  'http://localhost:3000',
  'https://www.pestorspointers.com',
  'https://pestorspointers.com',
].filter((v, i, a) => a.indexOf(v) === i);

const CORS_RULES = [{
  AllowedHeaders: ['*'],
  AllowedMethods: ['PUT', 'POST', 'GET', 'HEAD'],
  AllowedOrigins: ORIGINS,
  ExposeHeaders: ['ETag'],
  MaxAgeSeconds: 3000,
}];

try {
  const current = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log(`  ${c.dim('·')} CORS already set (${current.CORSRules?.length ?? 0} rule(s)) — leaving alone`);
} catch {
  if (dryRun) {
    console.log(`  ${c.cyan('▸')} would set CORS for: ${ORIGINS.join(', ')}`);
  } else {
    await s3.send(new PutBucketCorsCommand({ Bucket: BUCKET, CORSConfiguration: { CORSRules: CORS_RULES } }));
    console.log(`  ${c.green('✓')} CORS set — PUT/POST/GET/HEAD from ${ORIGINS.length} origin(s)`);
  }
}

// ── 3. Discover the rest ─────────────────────────────────────────────────────

try {
  const mc = new MediaConvertClient({ region: REGION, ...creds });
  const res = await mc.send(new DescribeEndpointsCommand({}));
  if (res.Endpoints?.[0]?.Url) discovered.MEDIACONVERT_ENDPOINT = res.Endpoints[0].Url;
} catch { /* reported by aws-status */ }

try {
  const dists = await cf.send(new ListDistributionsCommand({}));
  const forBucket = (dists.DistributionList?.Items ?? []).find((d) =>
    (d.Origins?.Items ?? []).some((o) => (o.DomainName ?? '').includes(BUCKET))
  );
  if (forBucket) discovered.CLOUDFRONT_DOMAIN = `https://${forBucket.DomainName}`;
  const keys = await cf.send(new ListPublicKeysCommand({}));
  const first = keys.PublicKeyList?.Items?.[0];
  if (first) discovered.CLOUDFRONT_KEY_PAIR_ID = first.Id;
} catch { /* reported by aws-status */ }

// ── Write .env ───────────────────────────────────────────────────────────────

if (Object.keys(discovered).length > 0) {
  let text = await fs.readFile(ENV_PATH, 'utf8');
  const changes = [];
  for (const [k, v] of Object.entries(discovered)) {
    const line = `${k}=${v}`;
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(text)) {
      const current = text.match(re)[0].slice(k.length + 1);
      if (current === v) continue;
      text = text.replace(re, line);
    } else {
      text = `${text.trimEnd()}\n${line}\n`;
    }
    changes.push(k);
  }
  if (changes.length === 0) {
    console.log(`  ${c.dim('·')} .env already has every discovered value`);
  } else if (dryRun) {
    console.log(`  ${c.cyan('▸')} would write to .env: ${changes.join(', ')}`);
  } else {
    await fs.writeFile(ENV_PATH, text);
    console.log(`  ${c.green('✓')} .env updated: ${changes.join(', ')}`);
  }
}

console.log(`
${c.bold('Still needed by hand')}
  ${c.red('CLOUDFRONT_PRIVATE_KEY')} — the private half of key ${discovered.CLOUDFRONT_KEY_PAIR_ID ?? '?'} is missing.
  Generate a new pair, add the public half in CloudFront → Key management,
  then:  base64 -i cf-private.pem | tr -d '\\n'   into server/.env

${dryRun ? c.yellow('Dry run — nothing was created or written.\n') : ''}`);
