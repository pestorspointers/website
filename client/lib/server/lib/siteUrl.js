/**
 * Where the public site lives. Stripe redirect URLs and Supabase invite links
 * are built from it, so getting it wrong sends real users somewhere broken.
 *
 * `NEXT_PUBLIC_SITE_URL` is the Next app's own setting and the one to keep
 * current. `CLIENT_URL` is accepted as a fallback because that is what the
 * standalone Express service used, and it may still be set; it could hold a
 * comma-separated CORS list, so only the first entry counts.
 */
export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.CLIENT_URL;
  return (configured ?? 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
}

export default siteUrl;
