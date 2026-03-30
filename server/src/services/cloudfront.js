import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

export function signCloudFrontUrl(s3Key, expirySeconds = 7200) {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKeyBase64 = process.env.CLOUDFRONT_PRIVATE_KEY;

  if (!domain || !keyPairId || !privateKeyBase64) {
    throw new Error('CloudFront env vars not configured');
  }

  const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf-8');
  const url = `${domain}/${s3Key}`;
  const dateLessThan = new Date(Date.now() + expirySeconds * 1000).toISOString();

  return getSignedUrl({ url, keyPairId, privateKey, dateLessThan });
}
