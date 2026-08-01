import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiGet, apiGetPersonalized } from '@/lib/serverApi';
import { getSessionUser } from '@/lib/supabase/server';
import PurchaseButton from './PurchaseButton';

// Locked/unlocked state differs per visitor, so this page is rendered fresh.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const course = await apiGet(`/api/v1/courses/${params.slug}`, { revalidate: 300 });
  if (!course) return { title: 'Course not found' };

  return {
    title: course.title,
    description: course.shortDescription || course.description,
    openGraph: course.thumbnailUrl ? { images: [{ url: course.thumbnailUrl }] } : undefined,
  };
}

export default async function CourseDetailPage({ params, searchParams }) {
  const [course, user] = await Promise.all([
    apiGetPersonalized(`/api/v1/courses/${params.slug}`),
    getSessionUser(),
  ]);

  if (!course) notFound();

  const justPurchased = searchParams?.purchased === '1';

  return (
    <main className="max-w-5xl mx-auto px-4 py-14">
      {justPurchased && (
        <p className="mb-8 p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg">
          Thanks for your purchase! Your videos are unlocked below. If they still look locked,
          refresh in a few seconds — the payment confirmation can take a moment.
        </p>
      )}

      <div className="grid md:grid-cols-[1fr_320px] gap-10 items-start">
        <div>
          <h1 className="text-4xl font-extrabold text-[#161E2A] mb-4">{course.title}</h1>
          <p className="text-lg text-gray-600 leading-relaxed whitespace-pre-line">
            {course.description}
          </p>

          <h2 className="text-xl font-bold text-[#161E2A] mt-12 mb-4">
            What&apos;s inside ({course.videos.length}{' '}
            {course.videos.length === 1 ? 'video' : 'videos'})
          </h2>

          {course.videos.length === 0 ? (
            <p className="text-gray-400">Videos are being added to this course.</p>
          ) : (
            <ol className="bg-white border rounded-2xl divide-y overflow-hidden">
              {course.videos.map((video, index) => (
                <li key={video.id}>
                  {video.locked ? (
                    <div className="flex items-center gap-4 p-4">
                      <span className="text-sm text-gray-400 w-6 shrink-0">{index + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-sm text-gray-500 truncate">
                          {video.title}
                        </span>
                        {video.description && (
                          <span className="block text-xs text-gray-400 truncate">
                            {video.description}
                          </span>
                        )}
                      </span>
                      <span className="text-gray-300 shrink-0" title="Locked">
                        🔒
                      </span>
                    </div>
                  ) : (
                    <Link
                      href={`/watch/${video.id}`}
                      className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm text-gray-400 w-6 shrink-0">{index + 1}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-sm text-[#161E2A] truncate">
                          {video.title}
                        </span>
                        {video.description && (
                          <span className="block text-xs text-gray-400 truncate">
                            {video.description}
                          </span>
                        )}
                      </span>
                      <span className="text-[#f53100] text-sm font-semibold shrink-0">Watch →</span>
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── Buy box ── */}
        <aside className="bg-white border rounded-2xl overflow-hidden md:sticky md:top-24">
          {course.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.thumbnailUrl}
              alt={course.title}
              className="w-full aspect-video object-cover"
            />
          )}

          <div className="p-6">
            {course.hasAccess ? (
              <>
                <p className="font-semibold text-green-700 mb-1">You have this course</p>
                <p className="text-sm text-gray-500 mb-5">
                  Every video above is unlocked for you.
                </p>
                <Link
                  href="/dashboard"
                  className="block w-full text-center py-3 bg-[#f53100] text-white font-bold rounded-xl hover:bg-[#d42a00] transition-colors"
                >
                  Go to my dashboard
                </Link>
              </>
            ) : (
              <>
                <p className="text-3xl font-extrabold text-[#100566] mb-1">
                  ${Number(course.price).toFixed(2)}
                </p>
                <p className="text-sm text-gray-500 mb-5">
                  One payment. Lifetime access to these {course.videos.length} videos.
                </p>

                <PurchaseButton
                  courseId={course.id}
                  slug={course.slug}
                  isAuthenticated={Boolean(user)}
                />

                <p className="text-xs text-gray-400 text-center mt-4">
                  or{' '}
                  <Link href="/billing" className="underline">
                    join a membership
                  </Link>{' '}
                  to unlock more
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
