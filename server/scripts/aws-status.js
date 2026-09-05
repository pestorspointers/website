/**
 * Read-only survey of the AWS pieces the video pipeline needs.
 *
 * Playback depends on four things existing and agreeing with each other:
 *   S3            private bucket holding uploads/raw and videos/hls
 *   MediaConvert  an account endpoint and a role that can read/write the bucket
 *   CloudFront    a distribution in front of the bucket, with signed URLs on
 *   .env          values matching all of the above
 *
 * This creates nothing. It reports what is already there, what is missing, and
 * which env vars still need filling.
 *
 *   node scripts/aws-status.js
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  S3Client, GetBucketCorsCommand, GetPublicAccessBlockCommand,
  ListObjectsV2Command, GetBucketLocationCommand,
} from '@aws-sdk/client-s3';
import { MediaConvertClient, DescribeEndpointsCommand } from '@aws-sdk/client-mediaconvert';
import { IAMClient, ListRolesCommand, GetRoleCommand, ListAttachedRolePoliciesCommand } from '@aws-sdk/client-iam';
import { CloudFrontClient, ListDistributionsCommand, ListKeyGroupsCommand, ListPublicKeysCommand } from '@aws-sdk/client-cloudfront';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const ok = (s) => `${c.green('✓')} ${s}`;
const no = (s) => `${c.red('✗')} ${s}`;
const warn = (s) => `${c.yellow('!')} ${s}`;

const REGION = process.env.AWS_REGION || 'us-east-2';
const BUCKET = process.env.S3_BUCKET_NAME;
const creds = process.env.AWS_ACCESS_KEY_ID
  ? {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    }
  : {};

const s3 = new S3Client({ region: REGION, ...creds });
const iam = new IAMClient({ region: REGION, ...creds });
const cf = new CloudFrontClient({ region: REGION, ...creds });

const todo = [];
const envNeeded = {};

console.log(`\n${c.bold('AWS video pipeline — current state')}\n  region ${REGION}  bucket ${BUCKET ?? c.red('(unset)')}\n`);

// ── S3 ───────────────────────────────────────────────────────────────────────

console.log(c.bold('S3'));
try {
  const loc = await s3.send(new GetBucketLocationCommand({ Bucket: BUCKET }));
  const actual = loc.LocationConstraint || 'us-east-1';
  console.log(actual === REGION ? ok(`bucket is in ${actual}`) : warn(`bucket is in ${actual}, AWS_REGION says ${REGION}`));

  const raw = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'uploads/raw/', MaxKeys: 1 }));
  const hls = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'videos/hls/', MaxKeys: 1 }));
  console.log(raw.KeyCount ? ok('uploads/raw/ has objects') : no('uploads/raw/ is empty'));
  console.log(hls.KeyCount ? ok('videos/hls/ has objects — some transcoding has run') : no('videos/hls/ is empty — nothing transcoded yet'));
  if (!hls.KeyCount) todo.push('transcode the 418 videos to HLS');

  try {
    const pab = await s3.send(new GetPublicAccessBlockCommand({ Bucket: BUCKET }));
    const cfg = pab.PublicAccessBlockConfiguration ?? {};
    const allBlocked = cfg.BlockPublicAcls && cfg.BlockPublicPolicy && cfg.IgnorePublicAcls && cfg.RestrictPublicBuckets;
    console.log(allBlocked ? ok('public access fully blocked') : warn('public access is NOT fully blocked — course video would be reachable directly'));
    if (!allBlocked) todo.push('turn on Block Public Access for the bucket');
  } catch {
    console.log(warn('no public access block configured — course video may be publicly reachable'));
    todo.push('turn on Block Public Access for the bucket');
  }

  try {
    const cors = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
    const rules = cors.CORSRules ?? [];
    const allowsPut = rules.some((r) => (r.AllowedMethods ?? []).includes('PUT'));
    console.log(allowsPut ? ok(`CORS allows PUT (${rules.length} rule(s)) — browser uploads will work`) : warn('CORS exists but does not allow PUT'));
    if (!allowsPut) todo.push('add a CORS rule allowing PUT from the site origin');
  } catch {
    console.log(no('no CORS configuration — admin browser uploads will fail'));
    todo.push('add a CORS rule allowing PUT from the site origin');
  }
} catch (err) {
  console.log(no(`cannot inspect bucket: ${err.name} ${err.message?.slice(0, 60) ?? ''}`));
}

// ── MediaConvert ─────────────────────────────────────────────────────────────

console.log(`\n${c.bold('MediaConvert')}`);
let mcEndpoint = null;
try {
  const mc = new MediaConvertClient({ region: REGION, ...creds });
  const res = await mc.send(new DescribeEndpointsCommand({}));
  mcEndpoint = res.Endpoints?.[0]?.Url ?? null;
  if (mcEndpoint) {
    console.log(ok(`account endpoint: ${mcEndpoint}`));
    if (process.env.MEDIACONVERT_ENDPOINT !== mcEndpoint) envNeeded.MEDIACONVERT_ENDPOINT = mcEndpoint;
  } else {
    console.log(no('no endpoint returned'));
  }
} catch (err) {
  console.log(no(`DescribeEndpoints failed: ${err.name}`));
}

// A role MediaConvert can assume, with read/write on the bucket.
let mcRole = null;
try {
  const roles = await iam.send(new ListRolesCommand({ MaxItems: 200 }));
  const candidates = (roles.Roles ?? []).filter((r) => {
    const doc = decodeURIComponent(r.AssumeRolePolicyDocument ?? '');
    return doc.includes('mediaconvert.amazonaws.com');
  });
  if (candidates.length > 0) {
    mcRole = candidates[0];
    console.log(ok(`role assumable by MediaConvert: ${mcRole.RoleName}`));
    const attached = await iam.send(new ListAttachedRolePoliciesCommand({ RoleName: mcRole.RoleName }));
    const names = (attached.AttachedPolicies ?? []).map((p) => p.PolicyName);
    console.log(c.dim(`     policies: ${names.join(', ') || '(none attached — inline only?)'}`));
    if (process.env.MEDIACONVERT_ROLE_ARN !== mcRole.Arn) envNeeded.MEDIACONVERT_ROLE_ARN = mcRole.Arn;
  } else {
    console.log(no('no IAM role trusts mediaconvert.amazonaws.com'));
    todo.push('create an IAM role MediaConvert can assume, with S3 read/write on the bucket');
  }
} catch (err) {
  console.log(warn(`cannot list IAM roles (${err.name}) — needs iam:ListRoles`));
}

// ── CloudFront ───────────────────────────────────────────────────────────────

console.log(`\n${c.bold('CloudFront')}`);
try {
  const dists = await cf.send(new ListDistributionsCommand({}));
  const items = dists.DistributionList?.Items ?? [];
  const forBucket = items.filter((d) =>
    (d.Origins?.Items ?? []).some((o) => (o.DomainName ?? '').includes(BUCKET ?? '\0'))
  );
  if (items.length === 0) {
    console.log(no('no distributions in this account'));
    todo.push('create a CloudFront distribution in front of the bucket');
  } else if (forBucket.length === 0) {
    console.log(warn(`${items.length} distribution(s), none pointing at ${BUCKET}`));
    items.slice(0, 5).forEach((d) => console.log(c.dim(`     ${d.DomainName} → ${(d.Origins?.Items ?? []).map((o) => o.DomainName).join(', ')}`)));
    todo.push('create a CloudFront distribution in front of the bucket');
  } else {
    for (const d of forBucket) {
      console.log(ok(`${d.DomainName}  ${d.Enabled ? 'enabled' : c.yellow('DISABLED')}  status=${d.Status}`));
      const behaviour = d.DefaultCacheBehavior ?? {};
      const signed = (behaviour.TrustedKeyGroups?.Enabled) || (behaviour.TrustedSigners?.Enabled);
      console.log(signed ? ok('   signed URLs required') : warn('   signed URLs NOT required — anyone with the URL can watch'));
      if (!signed) todo.push('require signed URLs on the distribution (TrustedKeyGroups)');
      if (!process.env.CLOUDFRONT_DOMAIN) envNeeded.CLOUDFRONT_DOMAIN = `https://${d.DomainName}`;
    }
  }

  const keys = await cf.send(new ListPublicKeysCommand({}));
  const kcount = keys.PublicKeyList?.Quantity ?? 0;
  const groups = await cf.send(new ListKeyGroupsCommand({}));
  const gcount = groups.KeyGroupList?.Quantity ?? 0;
  console.log(kcount > 0 ? ok(`${kcount} public key(s), ${gcount} key group(s) — signing is set up`) : no('no CloudFront public keys — cannot sign URLs'));
  if (kcount === 0) todo.push('create a CloudFront key pair + key group for signed URLs');
  if (kcount > 0 && !process.env.CLOUDFRONT_KEY_PAIR_ID) {
    const first = keys.PublicKeyList?.Items?.[0];
    if (first) envNeeded.CLOUDFRONT_KEY_PAIR_ID = first.Id;
  }
} catch (err) {
  console.log(warn(`cannot list CloudFront (${err.name}) — needs cloudfront:List*`));
}

// ── .env ─────────────────────────────────────────────────────────────────────

console.log(`\n${c.bold('.env')}`);
for (const k of ['AWS_REGION', 'S3_BUCKET_NAME', 'MEDIACONVERT_ENDPOINT', 'MEDIACONVERT_ROLE_ARN', 'CLOUDFRONT_DOMAIN', 'CLOUDFRONT_KEY_PAIR_ID', 'CLOUDFRONT_PRIVATE_KEY']) {
  const v = process.env[k];
  console.log(v ? ok(`${k}`) : no(`${k} ${c.dim('— empty')}`));
}

if (Object.keys(envNeeded).length > 0) {
  console.log(`\n${c.bold('Values discovered that belong in server/.env')}`);
  for (const [k, v] of Object.entries(envNeeded)) console.log(`  ${k}=${v}`);
}

console.log(`\n${c.bold('Outstanding')}`);
if (todo.length === 0) console.log(ok('nothing — the pipeline looks complete'));
else todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
console.log();
