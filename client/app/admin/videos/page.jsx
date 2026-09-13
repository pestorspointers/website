'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import ImageField from '@/components/admin/ImageField';
import VideoPreviewModal from '@/components/admin/VideoPreviewModal';

/**
 * The video library.
 *
 * Uploading is a four-step dance and the UI walks through it:
 *   1. create the database record so we have an id
 *   2. ask the API for a presigned S3 URL and PUT the file straight to S3
 *   3. tell the API to start transcoding to HLS
 *   4. poll until it's ready, then publish
 */

/**
 * `pending` covers two genuinely different situations — a video whose file was
 * never uploaded, and one that was uploaded but never processed for streaming.
 * `hasSourceFile` from the API separates them, so the badge stops calling an
 * uploaded video empty.
 */
function statusOf(video) {
  if (video.transcodeStatus === 'pending' && video.hasSourceFile) return 'unprocessed';
  return video.transcodeStatus;
}

const STATUS_LABELS = {
  pending: 'No file uploaded',
  unprocessed: 'Not processed for streaming',
  processing: 'Processing…',
  ready: 'Ready to play',
  failed: 'Processing failed',
};

/** How many in-flight transcodes to ask about per polling tick. */
const POLL_BATCH = 12;

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-500',
  unprocessed: 'bg-amber-100 text-amber-700',
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
  const [previewing, setPreviewing] = useState(null);
  const [bulk, setBulk] = useState(null);
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

  // Keep an eye on anything mid-transcode so the badges flip on their own.
  //
  // Each check is one MediaConvert lookup, so asking about every job on every
  // tick would mean hundreds of calls a minute once a bulk run is under way.
  // Instead a fixed-size window walks through the processing videos, wrapping
  // around: a full sweep takes a few minutes, which is the timescale these
  // jobs finish on anyway.
  const videosRef = useRef(videos);
  videosRef.current = videos;
  const pollCursor = useRef(0);
  const anyProcessing = videos.some((v) => v.transcodeStatus === 'processing');

  useEffect(() => {
    if (!anyProcessing) return;

    const timer = setInterval(async () => {
      const processing = videosRef.current.filter((v) => v.transcodeStatus === 'processing');
      if (!processing.length) return;

      const start = pollCursor.current % processing.length;
      const batch = Array.from({ length: Math.min(POLL_BATCH, processing.length) }, (_, i) =>
        processing[(start + i) % processing.length]
      );
      pollCursor.current = start + batch.length;

      const results = await Promise.all(
        batch.map(async (video) => {
          try {
            const { data } = await api.get(`/api/v1/videos/${video.id}/transcode-status`);
            return { id: video.id, status: data.status };
          } catch {
            // Transient failures are fine — the next sweep tries again.
            return null;
          }
        })
      );

      const changed = new Map(
        results.filter((r) => r && r.status !== 'processing').map((r) => [r.id, r.status])
      );
      if (changed.size) {
        setVideos((prev) =>
          prev.map((v) => (changed.has(v.id) ? { ...v, transcodeStatus: changed.get(v.id) } : v))
        );
      }
    }, 15000);

    return () => clearInterval(timer);
  }, [anyProcessing]);

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

  /** Hand one video to MediaConvert. Returns true when a job was accepted. */
  const process = async (video) => {
    try {
      const { data } = await api.post(`/api/v1/videos/${video.id}/transcode`);
      setVideos((prev) => prev.map((v) => (v.id === video.id ? { ...v, ...data } : v)));
      return true;
    } catch (err) {
      setError(`${video.title}: ${err.message}`);
      return false;
    }
  };

  /**
   * Process everything that has a file but no streaming version.
   *
   * Two at a time, deliberately: MediaConvert throttles job creation, and the
   * jobs queue on their own once submitted, so there is nothing to gain by
   * pushing harder and a throttling error to lose. Several hundred videos take
   * a few minutes to submit.
   */
  const processAll = async () => {
    const queue = videos.filter(
      (v) => v.hasSourceFile && v.transcodeStatus !== 'ready' && v.transcodeStatus !== 'processing'
    );
    if (!queue.length) return;

    if (
      !confirm(
        `Process ${queue.length} videos for streaming?\n\n` +
          'This runs a paid AWS MediaConvert job for each one and cannot be ' +
          'cancelled once started. Videos become publishable as they finish, ' +
          'which takes a few minutes each.'
      )
    ) {
      return;
    }

    setError('');
    setBulk({ done: 0, total: queue.length, failed: 0 });

    let cursor = 0;
    let failed = 0;

    const worker = async () => {
      while (cursor < queue.length) {
        const video = queue[cursor++];
        const ok = await process(video);
        if (!ok) failed += 1;
        setBulk({ done: Math.min(cursor, queue.length), total: queue.length, failed });
      }
    };

    await Promise.all(Array.from({ length: 2 }, worker));
    setBulk(null);
  };

  /** Publish every video that has a streaming version and isn't live yet. */
  const publishAllReady = async () => {
    const queue = videos.filter((v) => v.transcodeStatus === 'ready' && !v.isPublished);
    if (!queue.length) return;
    if (!confirm(`Publish ${queue.length} videos? They become visible to customers.`)) return;

    setError('');
    setBulk({ done: 0, total: queue.length, failed: 0, verb: 'Publishing' });

    let done = 0;
    for (const video of queue) {
      try {
        await api.patch(`/api/v1/videos/${video.id}`, { isPublished: true });
        setVideos((prev) =>
          prev.map((v) => (v.id === video.id ? { ...v, isPublished: true } : v))
        );
      } catch (err) {
        setError(`${video.title}: ${err.message}`);
      }
      done += 1;
      setBulk({ done, total: queue.length, failed: 0, verb: 'Publishing' });
    }
    setBulk(null);
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

  const unprocessedCount = videos.filter(
    (v) => v.hasSourceFile && v.transcodeStatus !== 'ready' && v.transcodeStatus !== 'processing'
  ).length;
  const processingCount = videos.filter((v) => v.transcodeStatus === 'processing').length;
  const publishableCount = videos.filter(
    (v) => v.transcodeStatus === 'ready' && !v.isPublished
  ).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Videos</h1>
          <p className="text-gray-500">
            Lessons live here. Attach one to a course and only buyers of that course can watch it.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {publishableCount > 0 && (
            <button
              type="button"
              onClick={publishAllReady}
              disabled={Boolean(bulk)}
              className="px-4 py-2 border border-green-700 text-green-700 text-sm font-semibold rounded hover:bg-green-50 disabled:opacity-50"
            >
              Publish {publishableCount} ready
            </button>
          )}
          {unprocessedCount > 0 && (
            <button
              type="button"
              onClick={processAll}
              disabled={Boolean(bulk)}
              className="px-4 py-2 border border-[#161E2A] text-[#161E2A] text-sm font-semibold rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {bulk
                ? `${bulk.verb ?? 'Processing'} ${bulk.done} of ${bulk.total}…`
                : `Process ${unprocessedCount} for streaming`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00]"
          >
            {showForm ? 'Cancel' : 'Add a video'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {bulk && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <div className="h-2 bg-blue-100 rounded overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${Math.round((bulk.done / bulk.total) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-blue-800 mt-2">
            {bulk.verb ?? 'Processing'} {bulk.done} of {bulk.total}. Keep this tab open.
          </p>
        </div>
      )}

      {!loading && !bulk && (unprocessedCount > 0 || processingCount > 0) && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
          {unprocessedCount > 0 && (
            <p>
              {unprocessedCount} videos have a file you can play here, but no streaming version
              yet. Customers see nothing on a course page until a video is processed and then
              published.
            </p>
          )}
          {processingCount > 0 && (
            <p className={unprocessedCount > 0 ? 'mt-1' : undefined}>
              {processingCount} are processing now. This page updates on its own as they finish.
            </p>
          )}
        </div>
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
                <PlayButton video={video} onPlay={() => setPreviewing(video)} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold truncate">{video.title}</h2>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${STATUS_STYLES[statusOf(video)]}`}
                      title={
                        statusOf(video) === 'unprocessed'
                          ? 'The file is uploaded and you can play it here. Customers need it processed for streaming first.'
                          : undefined
                      }
                    >
                      {STATUS_LABELS[statusOf(video)]}
                    </span>
                    {!video.isPublished && (
                      <span
                        className="text-[10px] uppercase bg-gray-100 text-gray-500 px-2 py-0.5 rounded"
                        title="Not visible to customers yet."
                      >
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
                      video.transcodeStatus === 'ready'
                        ? undefined
                        : statusOf(video) === 'unprocessed'
                          ? 'This video has to be processed for streaming before customers can watch it.'
                          : 'Wait until processing finishes'
                    }
                    className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-40"
                  >
                    {video.isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                  {statusOf(video) === 'unprocessed' && (
                    <button
                      type="button"
                      onClick={() => process(video)}
                      disabled={Boolean(bulk)}
                      title="Convert this video for streaming so customers can watch it"
                      className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-40"
                    >
                      Process
                    </button>
                  )}
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

      {previewing && (
        <VideoPreviewModal video={previewing} onClose={() => setPreviewing(null)} />
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

/**
 * The thumbnail doubles as the play control. It stays clickable whatever the
 * transcode status says, because an admin can fall back to the original
 * upload; if there is genuinely no file, the modal says so.
 */
function PlayButton({ video, onPlay }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      title={`Play "${video.title}"`}
      aria-label={`Play ${video.title}`}
      className="group relative w-24 h-16 rounded shrink-0 overflow-hidden bg-gray-100"
    >
      {video.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
      ) : null}

      <span className="absolute inset-0 flex items-center justify-center text-2xl text-white bg-black/30 group-hover:bg-black/50 transition-colors">
        ▶
      </span>
    </button>
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
