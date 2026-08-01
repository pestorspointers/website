import { apiGet } from './serverApi';

/** Fetch a CMS page (and its visible blocks, in order) by slug. */
export async function getPage(slug) {
  return apiGet(`/api/v1/pages/${slug}`, { revalidate: 60, fallback: null });
}

/** Page metadata for Next's generateMetadata(). */
export async function pageMetadata(slug, fallback = {}) {
  const page = await getPage(slug);
  if (!page) return fallback;

  const title = page.metaTitle || page.title || fallback.title;
  const description = page.metaDescription || fallback.description;

  return {
    title,
    description,
    openGraph: { title, description },
  };
}
