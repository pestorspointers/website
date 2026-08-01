import Link from 'next/link';
import { apiGetAuthed } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Pages' };

export default async function AdminPagesList() {
  const pages = (await apiGetAuthed('/api/v1/pages/admin/all', { fallback: [] })) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Pages</h1>
      <p className="text-gray-500 mb-8">
        Edit the words, images and sections on your website. Changes go live as soon as you save.
      </p>

      {pages.length === 0 ? (
        <div className="bg-white border rounded-lg p-8 text-center">
          <p className="text-gray-500">
            No pages found. Run <code className="text-sm bg-gray-100 px-1 rounded">supabase/seed.sql</code>{' '}
            to create the starter pages.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pages.map((page) => (
            <Link
              key={page.id}
              href={`/admin/pages/${page.slug}`}
              className="bg-white border rounded-lg p-5 hover:border-[#f53100] transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold group-hover:text-[#f53100] transition-colors">
                    {page.title}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {page.slug === 'home' ? '/' : `/${page.slug}`}
                  </p>
                </div>
                {!page.isPublished && (
                  <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-1 rounded">
                    Hidden
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-3">
                {page.blockCount} {page.blockCount === 1 ? 'section' : 'sections'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
