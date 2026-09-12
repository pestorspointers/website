/**
 * How the S3 and MediaConvert clients get their region and credentials.
 *
 * Amplify refuses to let you create an environment variable beginning with
 * `AWS`, and the Lambda runtime behind Amplify's compute sets `AWS_REGION`,
 * `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` itself.
 * So `AWS_REGION` is not just unsettable in the console, it arrives already set
 * to whatever region the function runs in. Reading it would have pointed every
 * S3 call at the wrong region and failed with a "bucket does not exist" that
 * has nothing to do with the bucket.
 *
 * Hence the `APP_AWS_` prefix: it is ours, it is settable, and nothing injects
 * it behind our back. The unprefixed names still work when we are not running
 * on Lambda, which keeps local development and the scripts in `server/` working
 * off the same `.env` they always used.
 */

const onLambda = () => Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

/** The region the media bucket, distribution and MediaConvert queue live in. */
export function awsRegion() {
  const explicit = process.env.APP_AWS_REGION;
  if (explicit) return explicit;

  if (onLambda()) {
    // Falling back here would silently use the function's own region.
    throw new Error(
      'APP_AWS_REGION is not set. Set it to the region your S3 bucket is in ' +
        '(the Amplify console rejects variables starting with AWS).'
    );
  }

  return process.env.AWS_REGION || 'us-east-1';
}

/**
 * Explicit credentials, or `undefined` to let the SDK work it out for itself.
 *
 * Returning `undefined` is the important case: on Lambda the SDK picks up the
 * execution role, and locally it picks up `~/.aws/credentials`. Handing it a
 * bare key and secret from the ambient Lambda variables would break auth, since
 * those credentials are temporary and only valid with their session token.
 */
export function awsCredentials() {
  const accessKeyId = process.env.APP_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.APP_AWS_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) return { accessKeyId, secretAccessKey };

  if (!onLambda() && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return undefined;
}

/** Spread into any AWS SDK client constructor. */
export function awsClientConfig() {
  const credentials = awsCredentials();
  return { region: awsRegion(), ...(credentials && { credentials }) };
}
