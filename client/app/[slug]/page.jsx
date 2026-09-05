import { notFound } from 'next/navigation';
import CmsPage from '@/components/CmsPage';
import { getPage, pageMetadata } from '@/lib/pages';

/**
 * Renders any published CMS page by its address.
 *
 * Without this the admin could build a page and then have no way to show it —
 * only /about and /contact had routes. Static routes (/courses, /blog, /admin…)
 * still take priority in Next's matcher, so this only catches what nothing else
 * claims.
 */
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return pageMetadata(slug, { title: slug });
}

export default async function DynamicCmsPage({ params }) {
  const { slug } = await params;

  // A missing page must 404 rather than render the "not set up yet" helper —
  // that message is for a known page awaiting content, not an invented address.
  const page = await getPage(slug);
  if (!page) notFound();

  return <CmsPage slug={slug} />;
}
