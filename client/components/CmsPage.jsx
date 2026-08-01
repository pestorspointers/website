import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import BlockRenderer from '@/components/blocks/BlockRenderer';
import { getPage } from '@/lib/pages';

/**
 * Renders a page built in the admin page builder. The three system pages
 * (home, about, contact) each map to a route that hands its slug to this.
 */
export default async function CmsPage({ slug }) {
  const page = await getPage(slug);

  return (
    <>
      <PublicNav />

      <main className="min-h-[40vh]">
        {page?.blocks?.length ? (
          <BlockRenderer blocks={page.blocks} />
        ) : (
          <EmptyState slug={slug} missing={!page} />
        )}
      </main>

      <PublicFooter />
    </>
  );
}

/**
 * Shown when the page has no content yet — on a fresh install, or if someone
 * deletes every section. Points the owner at where to fix it rather than
 * rendering a blank white screen.
 */
function EmptyState({ slug, missing }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-[#161E2A] mb-3">
        {missing ? 'This page has not been set up yet' : 'This page is empty'}
      </h1>
      <p className="text-gray-500 mb-8">
        {missing
          ? `No page with the address "${slug}" exists in the database. Run the seed file in supabase/seed.sql to create the starter pages.`
          : 'Add some sections to it from the admin area.'}
      </p>
      <Link
        href="/admin/pages"
        className="inline-block px-6 py-3 bg-[#f53100] text-white font-semibold rounded-lg hover:bg-[#d42a00] transition-colors"
      >
        Go to the page editor
      </Link>
    </div>
  );
}
