'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import ImageField from '@/components/admin/ImageField';

/**
 * Course editor. The "Videos in this course" list is the important part: the
 * order here is the order members watch in, and a video only unlocks for
 * someone who owns *this* course.
 */
export default function AdminCourseEditPage() {
  const { id } = useParams();
  const router = useRouter();

  const [course, setCourse] = useState(null);
  const [videos, setVideos] = useState([]);
  const [available, setAvailable] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [tierIds, setTierIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [{ data: courseData }, { data: videoData }, { data: tierData }] = await Promise.all([
          api.get(`/api/v1/courses/admin/${id}`),
          api.get('/api/v1/videos/admin/all'),
          api.get('/api/v1/admin/subscription-tiers'),
        ]);

        if (cancelled) return;

        setCourse(courseData);
        setVideos(courseData.videos ?? []);
        setTierIds(courseData.tierIds ?? []);
        setTiers(tierData);
        // Anything not already in a course is fair game to add to this one.
        setAvailable(videoData.filter((v) => !v.courseId));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const flash = (message) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 2500);
  };

  const saveDetails = async () => {
    setError('');
    try {
      const { data } = await api.patch(`/api/v1/courses/${id}`, {
        title: course.title,
        slug: course.slug,
        description: course.description,
        shortDescription: course.shortDescription,
        thumbnailUrl: course.thumbnailUrl,
        price: Number(course.price) || 0,
        isPublished: course.isPublished,
      });
      setCourse((prev) => ({ ...prev, ...data }));
      flash('Course saved');
    } catch (err) {
      setError(err.message);
    }
  };

  const saveVideoOrder = async (next) => {
    setVideos(next);
    try {
      await api.put(`/api/v1/courses/${id}/videos`, { videoIds: next.map((v) => v.id) });
      flash('Video list saved');
    } catch (err) {
      setError(err.message);
    }
  };

  const addVideo = (videoId) => {
    const video = available.find((v) => v.id === videoId);
    if (!video) return;
    setAvailable((prev) => prev.filter((v) => v.id !== videoId));
    saveVideoOrder([...videos, video]);
  };

  const removeVideo = (video) => {
    setAvailable((prev) => [video, ...prev]);
    saveVideoOrder(videos.filter((v) => v.id !== video.id));
  };

  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= videos.length) return;
    const next = [...videos];
    [next[index], next[target]] = [next[target], next[index]];
    saveVideoOrder(next);
  };

  const toggleTier = async (tierId) => {
    const next = tierIds.includes(tierId)
      ? tierIds.filter((t) => t !== tierId)
      : [...tierIds, tierId];

    setTierIds(next);
    try {
      await api.put(`/api/v1/courses/${id}/tiers`, { tierIds: next });
      flash('Membership access saved');
    } catch (err) {
      setError(err.message);
      setTierIds(tierIds);
    }
  };

  const deleteCourse = async () => {
    if (!confirm(`Delete "${course.title}"? Its videos stay in your library.`)) return;
    try {
      await api.delete(`/api/v1/courses/${id}`);
      router.push('/admin/courses');
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p className="text-gray-400">Loading…</p>;
  if (!course) return <p className="text-red-600">{error || 'Course not found.'}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <Link href="/admin/courses" className="text-sm text-gray-500 hover:underline">
            ← All courses
          </Link>
          <h1 className="text-2xl font-bold mt-1">{course.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {status && <span className="text-sm text-green-600">{status}</span>}
          {course.isPublished && (
            <a
              href={`/courses/${course.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm px-3 py-2 border rounded hover:bg-gray-100"
            >
              View page ↗
            </a>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* ── Details ── */}
        <section className="bg-white border rounded-lg p-6 space-y-4">
          <h2 className="font-bold text-lg">Course details</h2>

          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={course.title ?? ''}
              onChange={(e) => setCourse({ ...course, title: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Web address</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-400">/courses/</span>
              <input
                type="text"
                value={course.slug ?? ''}
                onChange={(e) => setCourse({ ...course, slug: e.target.value })}
                className="flex-1 border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Short summary (card text)</label>
            <input
              type="text"
              value={course.shortDescription ?? ''}
              onChange={(e) => setCourse({ ...course, shortDescription: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Full description</label>
            <textarea
              rows={5}
              value={course.description ?? ''}
              onChange={(e) => setCourse({ ...course, description: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <ImageField
            label="Cover image"
            value={course.thumbnailUrl}
            onChange={(v) => setCourse({ ...course, thumbnailUrl: v })}
          />

          <div>
            <label className="block text-sm font-medium mb-1">Price (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={course.price ?? 0}
              onChange={(e) => setCourse({ ...course, price: e.target.value })}
              className="w-40 border rounded px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(course.isPublished)}
              onChange={(e) => setCourse({ ...course, isPublished: e.target.checked })}
              className="w-4 h-4"
            />
            Published — visible on the website
          </label>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={saveDetails}
              className="px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00]"
            >
              Save details
            </button>
            <button
              type="button"
              onClick={deleteCourse}
              className="px-4 py-2 border text-red-600 text-sm rounded hover:bg-red-50 ml-auto"
            >
              Delete course
            </button>
          </div>
        </section>

        <div className="space-y-6">
          {/* ── Videos ── */}
          <section className="bg-white border rounded-lg p-6">
            <h2 className="font-bold text-lg mb-1">Videos in this course</h2>
            <p className="text-sm text-gray-500 mb-4">
              Buying this course unlocks exactly these videos, in this order.
            </p>

            <div className="space-y-2 mb-4">
              {videos.map((video, index) => (
                <div
                  key={video.id}
                  className="flex items-center gap-3 border rounded p-3 bg-gray-50"
                >
                  <span className="text-xs text-gray-400 w-5 shrink-0">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{video.title}</p>
                    <p className="text-xs text-gray-400">
                      {video.isPublished ? 'Published' : 'Draft'} ·{' '}
                      {video.transcodeStatus === 'ready' ? 'Ready to play' : video.transcodeStatus}
                      {/* A public video inside a paid course plays for
                          everyone — surfaced here so it's never a surprise. */}
                      {video.accessType === 'public' && (
                        <span className="text-amber-600"> · Free preview</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      className="px-2 py-1 text-xs border rounded bg-white disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === videos.length - 1}
                      className="px-2 py-1 text-xs border rounded bg-white disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeVideo(video)}
                      className="px-2 py-1 text-xs border rounded bg-white text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {videos.length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center border-2 border-dashed rounded">
                  No videos yet.
                </p>
              )}
            </div>

            <select
              defaultValue=""
              onChange={(e) => {
                addVideo(e.target.value);
                e.target.value = '';
              }}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">Add a video from your library…</option>
              {available.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title}
                </option>
              ))}
            </select>

            <p className="text-xs text-gray-400 mt-2">
              Only videos not already attached to another course appear here.{' '}
              <Link href="/admin/videos" className="underline">
                Upload a new one
              </Link>
              .
            </p>
          </section>

          {/* ── Membership access ── */}
          <section className="bg-white border rounded-lg p-6">
            <h2 className="font-bold text-lg mb-1">Included with these memberships</h2>
            <p className="text-sm text-gray-500 mb-4">
              Subscribers on a ticked plan get this course without buying it separately.
            </p>

            {tiers.length === 0 ? (
              <p className="text-sm text-gray-400">
                No membership plans yet.{' '}
                <Link href="/admin/subscriptions" className="underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              <div className="space-y-2">
                {tiers.map((tier) => (
                  <label key={tier.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tierIds.includes(tier.id)}
                      onChange={() => toggleTier(tier.id)}
                      className="w-4 h-4"
                    />
                    {tier.name}
                    {!tier.isActive && <span className="text-xs text-gray-400">(inactive)</span>}
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
