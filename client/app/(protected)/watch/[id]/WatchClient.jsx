'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import VideoPlayer from '@/components/VideoPlayer';

/**
 * Fetches a signed CloudFront URL and plays it. The URL expires after two
 * hours, so it is requested at watch time rather than baked into the page.
 */
export default function WatchClient({ video }) {
  const [streamUrl, setStreamUrl] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    api
      .get(`/api/v1/videos/${video.id}/stream`)
      .then(({ data }) => !cancelled && setStreamUrl(data.url))
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [video.id]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {video.courseSlug && (
        <Link
          href={`/courses/${video.courseSlug}`}
          className="text-sm text-gray-500 hover:underline"
        >
          ← {video.courseTitle}
        </Link>
      )}

      <div className="mt-4">
        {error ? (
          <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-center px-6">
            <div>
              <p className="text-red-600 font-medium mb-2">{error}</p>
              <p className="text-sm text-gray-500">
                If this video was just uploaded, processing may still be finishing.
              </p>
            </div>
          </div>
        ) : streamUrl ? (
          <VideoPlayer src={streamUrl} poster={video.thumbnailUrl} />
        ) : (
          <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
            <p className="text-gray-400">Loading video…</p>
          </div>
        )}
      </div>

      <h1 className="text-2xl font-bold text-[#161E2A] mt-6">{video.title}</h1>
      {video.description && (
        <p className="text-gray-600 mt-2 leading-relaxed">{video.description}</p>
      )}

      <Link
        href="/dashboard"
        className="inline-block mt-8 text-sm font-semibold text-[#100566] hover:underline"
      >
        ← Back to my dashboard
      </Link>
    </div>
  );
}
