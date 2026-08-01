'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import ImageField from '@/components/admin/ImageField';

/**
 * The video library.
 *
 * Uploading is a four-step dance and the UI walks through it:
 *   1. create the database record so we have an id
 *   2. ask the API for a presigned S3 URL and PUT the file straight to S3
 *   3. tell the API to start transcoding to HLS
 *   4. poll until it's ready, then publish
 */

const STATUS_LABELS = {
  pending: 'No file uploaded',
  processing: 'Processing…',
  ready: 'Ready to play',
  failed: 'Processing failed',
};

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-500',
  processing: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function AdminVideosPage() {
  const [videos, setVideos] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    accessType: 'course',
    courseId: '',
    price: '',
  });
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [step, setStep] = useState('');
  const fileInput = useRef(null);

  useEffect(() => {
    Promise.all([api.get('/api/v1/videos/admin/all'), api.get('/api/v1/courses/admin/all')])
      .then(([videoRes, courseRes]) => {
        setVideos(videoRes.data);
        setCourses(courseRes.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Keep an eye on anything mid-transcode so the badge flips on its own.
  useEffect(() => {
    const processing = videos.filter((v) => v.transcodeStatus === 'processing');
    if (!processing.length) return;

    const timer = setInterval(async () => {
      for (const video of processing) {
        try {
          const { data } = await api.get(`/api/v1/videos/${video.id}/transcode-status`);
          if (data.status !== video.transcodeStatus) {
            setVideos((prev) =>
              prev.map((v) => (v.id === video.id ? { ...v, transcodeStatus: data.status } : v))
            );
          }
        } catch {
          // Transient failures are fine — we'll try again on the next tick.
        }
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [videos]);

  const resetForm = () => {
    setForm({ title: '', description: '', accessType: 'course', courseId: '', price: '' });
    setFile(null);
    setProgress(null);
    setStep('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const upload = async (e) => {
    e.preventDefault();
    setError('');

    if (form.accessType === 'course' && !form.courseId) {
      setError('Pick which course this video belongs to.');
      return;
    }

    try {
      setStep('Creating the video…');
      const { data: video } = await api.post('/api/v1/videos', {
        title: form.title,
        description: form.description,
        accessType: form.accessType,
        courseId: form.courseId || undefined,
        price: form.accessType === 'purchase' ? Number(form.price) || 0 : undefined,
      });

      let created = video;

      if (file) {
        setStep('Getting an upload link…');
        const { data: presigned } = await api.post(`/api/v1/videos/${video.id}/upload-url`, {
          contentType: file.type || 'video/mp4',
        });

        setStep('Uploading the file…');
        setProgress(0);

        // Straight to S3 — deliberately not through axios' api instance, which
        // would attach an Authorization header that S3 rejects.
        await uploadToS3(presigned.uploadUrl, file, setProgress);

        setStep('Starting processing…');
        const { data: transcoded } = await api.post(`/api/v1/videos/${video.id}/transcode`);
        created = transcoded;
      }

      setVideos((prev) => [created, ...prev]);
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err.message);
      setStep('');
      setProgress(null);
    }
  };

  const save = async (video) => {
    setError('');
    try {
      const { data } = await api.patch(`/api/v1/videos/${video.id}`, {
        title: video.title,
        description: video.description,
        thumbnailUrl: video.thumbnailUrl,
        accessType: video.accessType,
        courseId: video.courseId || null,
        price: video.accessType === 'purchase' ? Number(video.price) || 0 : null,
        isPublished: video.isPublished,
      });
      setVideos((prev) => prev.map((v) => (v.id === data.id ? { ...v, ...data } : v)));
      setEditing(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const togglePublished = async (video) => {
    try {
      const { data } = await api.patch(`/api/v1/videos/${video.id}`, {
        isPublished: !video.isPublished,
      });
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, isPublished: data.isPublished } : v))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (video) => {
    if (!confirm(`Delete "${video.title}"? The video file is deleted too.`)) return;
    try {
      await api.delete(`/api/v1/videos/${video.id}`);
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Videos</h1>
          <p className="text-gray-500">
            Lessons live here. Attach one to a course and only buyers of that course can watch it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="shrink-0 px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00]"
        >
          {showForm ? 'Cancel' : 'Add a video'}
        </button>
      </div>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {showForm && (
        <form onSubmit={upload} className="bg-white border rounded-lg p-6 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Who can watch it</label>
              <select
                value={form.accessType}
                onChange={(e) => setForm({ ...form, accessType: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="course">Part of a course</option>
                <option value="public">Free for everyone</option>
                <option value="purchase">Sold on its own</option>
              </select>
            </div>

            {form.accessType === 'course' && (
              <div>
                <label className="block text-sm font-medium mb-1">Course</label>
                <select
                  value={form.courseId}
                  onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                >
                  <option value="">Choose a course…</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.accessType === 'purchase' && (
              <div>
                <label className="block text-sm font-medium mb-1">Price (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="w-full border rounded px-3 py-2 text-sm"
                  required
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Video file</label>
            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              MP4 works best. Processing into streaming quality takes a few minutes after upload.
            </p>
          </div>

          {progress !== null && (
            <div>
              <div className="h-2 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full bg-[#f53100] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{progress}% uploaded</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={Boolean(step)}
              className="px-4 py-2 bg-[#161E2A] text-white text-sm rounded hover:bg-black disabled:opacity-50"
            >
              {step || 'Add video'}
            </button>
            {step && <span className="text-sm text-gray-500">Please keep this tab open.</span>}
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : videos.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
          No videos yet.
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((video) =>
            editing === video.id ? (
              <VideoEditForm
                key={video.id}
                video={video}
                courses={courses}
                onCancel={() => setEditing(null)}
                onSave={save}
              />
            ) : (
              <div key={video.id} className="bg-white border rounded-lg p-5 flex items-center gap-5">
                {video.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="w-24 h-16 object-cover rounded shrink-0"
                  />
                ) : (
                  <div className="w-24 h-16 bg-gray-100 rounded shrink-0 flex items-center justify-center text-gray-300 text-2xl">
                    ▶
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold truncate">{video.title}</h2>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        STATUS_STYLES[video.transcodeStatus]
                      }`}
                    >
                      {STATUS_LABELS[video.transcodeStatus]}
                    </span>
                    {!video.isPublished && (
                      <span className="text-[10px] uppercase bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {video.accessType === 'public'
                      ? 'Free for everyone'
                      : video.accessType === 'purchase'
                        ? `Sold on its own · $${Number(video.price ?? 0).toFixed(2)}`
                        : video.courseTitle
                          ? `In: ${video.courseTitle}`
                          : 'Not attached to a course'}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => togglePublished(video)}
                    disabled={video.transcodeStatus !== 'ready' && !video.isPublished}
                    title={
                      video.transcodeStatus !== 'ready'
                        ? 'Wait until processing finishes'
                        : undefined
                    }
                    className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    {video.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(video.id)}
                    className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(video)}
                    className="text-xs px-3 py-1.5 border rounded text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-6">
        Course ordering is set on each{' '}
        <Link href="/admin/courses" className="underline">
          course page
        </Link>
        .
      </p>
    </div>
  );
}

function VideoEditForm({ video, courses, onCancel, onSave }) {
  const [draft, setDraft] = useState(video);

  return (
    <div className="bg-white border-2 border-[#f53100] rounded-lg p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          type="text"
          value={draft.title ?? ''}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          rows={2}
          value={draft.description ?? ''}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </div>

      <ImageField
        label="Thumbnail"
        value={draft.thumbnailUrl}
        onChange={(v) => setDraft({ ...draft, thumbnailUrl: v })}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Who can watch it</label>
          <select
            value={draft.accessType}
            onChange={(e) => setDraft({ ...draft, accessType: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            <option value="course">Part of a course</option>
            <option value="public">Free for everyone</option>
            <option value="purchase">Sold on its own</option>
          </select>
        </div>

        {draft.accessType === 'course' && (
          <div>
            <label className="block text-sm font-medium mb-1">Course</label>
            <select
              value={draft.courseId ?? ''}
              onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">Choose a course…</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {draft.accessType === 'purchase' && (
          <div>
            <label className="block text-sm font-medium mb-1">Price (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.price ?? ''}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border text-sm rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** XHR rather than fetch, because fetch still can't report upload progress. */
function uploadToS3(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status}). Check the S3 bucket's CORS rules.`));

    xhr.onerror = () =>
      reject(new Error('Upload failed. Check the S3 bucket CORS configuration.'));

    xhr.send(file);
  });
}
