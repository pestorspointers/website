import Link from 'next/link';
import { apiGetAuthed } from '@/lib/serverApi';
import { getProfile } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Dashboard' };

const STATUS_COPY = {
  active: { label: 'Active', tone: 'text-green-700 bg-green-100' },
  trialing: { label: 'Free trial', tone: 'text-blue-700 bg-blue-100' },
  past_due: { label: 'Payment failed', tone: 'text-amber-700 bg-amber-100' },
  canceled: { label: 'Cancelled', tone: 'text-gray-600 bg-gray-100' },
  none: { label: 'No membership', tone: 'text-gray-600 bg-gray-100' },
};

export default async function DashboardPage() {
  const [profile, mine, subscription] = await Promise.all([
    getProfile(),
    apiGetAuthed('/api/v1/courses/mine', { fallback: { courses: [] } }),
    apiGetAuthed('/api/v1/payments/subscription'),
  ]);

  const courses = mine?.courses ?? [];
  const status = subscription?.status ?? 'none';
  const statusCopy = STATUS_COPY[status] ?? STATUS_COPY.none;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-[#161E2A] mb-1">
        Welcome back{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
      </h1>
      <p className="text-gray-500 mb-8">Everything you have access to lives here.</p>

      {/* ── Membership ── */}
      <section className="bg-white border rounded-2xl p-6 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              Membership
            </p>
            <div className="flex items-center gap-3">
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${statusCopy.tone}`}>
                {statusCopy.label}
              </span>
              {subscription?.tier && (
                <span className="font-semibold text-[#161E2A]">{subscription.tier.name}</span>
              )}
            </div>
            {subscription?.currentPeriodEnd && status !== 'none' && (
              <p className="text-sm text-gray-500 mt-2">
                {subscription.cancelAtPeriodEnd ? 'Access ends' : 'Renews'} on{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>

          <Link
            href="/billing"
            className="px-5 py-3 bg-[#f53100] text-white font-semibold rounded-lg hover:bg-[#d42a00] transition-colors"
          >
            {status === 'active' || status === 'trialing' ? 'Manage membership' : 'See plans'}
          </Link>
        </div>

        {status === 'past_due' && (
          <p className="mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded">
            We couldn&apos;t take your last payment. Update your card to keep your access.
          </p>
        )}
      </section>

      {/* ── Courses ── */}
      <h2 className="text-xl font-bold text-[#161E2A] mb-4">My courses</h2>

      {courses.length === 0 ? (
        <div className="bg-white border rounded-2xl p-12 text-center">
          <p className="text-gray-500 mb-6">
            You don&apos;t have access to any courses yet.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/courses"
              className="px-6 py-3 bg-[#f53100] text-white font-semibold rounded-lg hover:bg-[#d42a00] transition-colors"
            >
              Browse the courses
            </Link>
            <Link
              href="/billing"
              className="px-6 py-3 border-2 border-[#100566] text-[#100566] font-semibold rounded-lg hover:bg-[#100566] hover:text-white transition-colors"
            >
              See membership plans
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {courses.map((course) => (
            <section key={course.id} className="bg-white border rounded-2xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-4 p-5 border-b bg-gray-50">
                {course.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.thumbnailUrl}
                    alt=""
                    className="w-20 h-14 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[#161E2A]">{course.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {course.videos.length} {course.videos.length === 1 ? 'video' : 'videos'} ·{' '}
                    {course.source === 'purchase'
                      ? 'You bought this course'
                      : 'Included with your membership'}
                  </p>
                </div>
              </div>

              {course.videos.length === 0 ? (
                <p className="p-5 text-sm text-gray-400">
                  No videos have been added to this course yet.
                </p>
              ) : (
                <ol className="divide-y">
                  {course.videos.map((video, index) => (
                    <li key={video.id}>
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
                        <span className="text-[#f53100] text-sm font-semibold shrink-0">
                          Watch →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
