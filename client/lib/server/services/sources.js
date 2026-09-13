import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { awsClientConfig } from '../lib/awsConfig.js';

/**
 * Which videos have an original upload sitting in the bucket.
 *
 * The `videos` table records that a video was *created*, and `transcode_status`
 * records that it was *converted*, but nothing in the database says whether the
 * file itself ever arrived. Without this, a video whose upload succeeded and
 * whose transcode was never started is indistinguishable from an empty record,
 * and the admin UI reports both as "No file uploaded".
 *
 * One listing answers the question for the whole library, which is what makes
 * this cheap enough to call on a page load. The answer only changes when
 * someone uploads, so a short cache keeps repeat loads free.
 */

const TTL_MS = 60_000;
const PREFIX = 'uploads/raw/';

let cache = { ids: null, expires: 0 };
let _s3;

function s3() {
  if (!_s3) _s3 = new S3Client(awsClientConfig());
  return _s3;
}

export async function uploadedSourceIds() {
  if (cache.ids && cache.expires > Date.now()) return cache.ids;

  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) return cache.ids ?? new Set();

  const ids = new Set();
  try {
    let token;
    do {
      const listed = await s3().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token })
      );
      for (const object of listed.Contents ?? []) {
        // uploads/raw/<video id>/original.mp4
        const id = object.Key.split('/')[2];
        if (id && (object.Size ?? 0) > 0) ids.add(id);
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
  } catch {
    // S3 unreachable. Serving the previous answer, or none, degrades the badge
    // to a guess rather than breaking the page that asked.
    return cache.ids ?? new Set();
  }

  cache = { ids, expires: Date.now() + TTL_MS };
  return ids;
}

/** Marks each row with whether its source file exists. */
export async function withSourceFlag(rows) {
  const ids = await uploadedSourceIds();
  return rows.map((row) => ({ ...row, hasSourceFile: ids.has(row.id) }));
}
