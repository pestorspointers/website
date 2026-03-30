'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import VideoPlayer from '../../../../components/VideoPlayer';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function WatchClient({ videoId }) {
  const { data: session } = useSession();
  const token = session?.user?.accessToken;

  const [streamUrl, setStreamUrl] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return;

    async function load() {
      // Fetch video metadata (from public list endpoint)
      const metaRes = await fetch(`${API}/api/v1/videos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (metaRes.ok) {
        const all = await metaRes.json();
        const found = all.find((v) => v._id === videoId);
        if (found) setMeta(found);
      }

      // Fetch signed stream URL
      const streamRes = await fetch(`${API}/api/v1/videos/${videoId}/stream`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (streamRes.status === 403) {
        setError('You do not have access to this video.');
        return;
      }
      if (!streamRes.ok) {
        setError('Video not found or not available yet.');
        return;
      }

      const { url } = await streamRes.json();
      setStreamUrl(url);
    }

    load();
  }, [token, videoId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-2">{error}</p>
          <a href="/billing" className="text-blue-600 underline text-sm">
            View subscription plans
          </a>
        </div>
      </div>
    );
  }

  if (!streamUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading video…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <VideoPlayer src={streamUrl} poster={meta?.thumbnailUrl} />
      {meta && (
        <div className="mt-4">
          <h1 className="text-xl font-bold">{meta.title}</h1>
          <p className="text-gray-600 mt-1 text-sm">{meta.description}</p>
        </div>
      )}
    </div>
  );
}
