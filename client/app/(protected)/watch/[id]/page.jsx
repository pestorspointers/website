import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiGetAuthed } from '@/lib/serverApi';
import WatchClient from './WatchClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const video = await apiGetAuthed(`/api/v1/videos/${params.id}/access`);
  return { title: video?.title ?? 'Watch' };
}

export default async function WatchPage({ params }) {
  const video = await apiGetAuthed(`/api/v1/videos/${params.id}/access`);
  if (!video) notFound();

  // The paywall. The API enforces this again before it will hand out a signed
  // playback URL — this check just avoids rendering a player that can't play.
  if (!video.hasAccess) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-5xl mb-6">🔒</p>
        <h1 className="text-2xl font-bold text-[#161E2A] mb-3">
          This video is part of {video.courseTitle ? `“${video.courseTitle}”` : 'a paid course'}
        </h1>
        <p className="text-gray-500 mb-8">
          Buy the course, or join a membership that includes it, to watch.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {video.courseSlug && (
            <Link
              href={`/courses/${video.courseSlug}`}
              className="px-6 py-3 bg-[#f53100] text-white font-semibold rounded-lg hover:bg-[#d42a00] transition-colors"
            >
              See the course
            </Link>
          )}
          <Link
            href="/billing"
            className="px-6 py-3 border-2 border-[#100566] text-[#100566] font-semibold rounded-lg hover:bg-[#100566] hover:text-white transition-colors"
          >
            View membership plans
          </Link>
        </div>
      </div>
    );
  }

  return <WatchClient video={video} />;
}
