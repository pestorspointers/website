'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import VideoPlayer from '@/components/VideoPlayer';

/**
 * Plays any video in the library without leaving the admin list.
 *
 * The stream endpoint lets an admin through regardless of entitlements or
 * publish state, and falls back to the original upload when nothing has been
 * transcoded yet — so this plays whatever actually exists for a video.
 */
export default function VideoPreviewModal({ video, onClose }) {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStream(null);
    setError('');

    api
      .get(`/api/v1/videos/${video.id}/stream`)
      .then(({ data }) => !cancelled && setStream(data))
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [video.id]);

  // Escape closes, and the page behind shouldn't scroll while it's open.
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${video.title}`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg w-full max-w-3xl max-h-full overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b">
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{video.title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {stream?.kind === 'source'
                ? 'Playing the original upload. Customers see the streaming version once this video is processed and published.'
                : !video.isPublished
                  ? 'This is a draft. Only admins can watch it.'
                  : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {error ? (
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center text-center px-6">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          ) : stream ? (
            <VideoPlayer
              src={stream.url}
              poster={video.thumbnailUrl}
              type={stream.kind === 'source' ? 'video/mp4' : 'application/x-mpegURL'}
            />
          ) : (
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
              <p className="text-gray-400 text-sm">Loading video…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
