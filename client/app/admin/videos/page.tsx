'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';

interface Video {
  _id: string;
  title: string;
  description: string;
  accessType: 'public' | 'course' | 'purchase';
  isPublished: boolean;
  thumbnailUrl?: string;
  duration?: number;
  price?: number;
  s3Key?: string;
  createdAt: string;
}

type UploadStep = 'idle' | 'uploading' | 'transcoding' | 'saving' | 'done';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function AdminVideosPage() {
  const { data: session } = useSession();
  const token = (session?.user as { accessToken?: string })?.accessToken;

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload form state
  const [showForm, setShowForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    accessType: 'course' as 'public' | 'course' | 'purchase',
    price: '',
    thumbnailUrl: '',
  });
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const fetchVideos = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`${API}/api/v1/videos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setVideos(data);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !token) return;
    setError('');

    try {
      // 1. Create a temporary video ID (MongoDB ObjectId format)
      const tempId = crypto.randomUUID().replace(/-/g, '').slice(0, 24);

      // 2. Get presigned S3 upload URL
      setUploadStep('uploading');
      const urlRes = await fetch(`${API}/api/v1/videos/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoId: tempId, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, key } = await urlRes.json();

      // 3. PUT file directly to S3 (shows progress)
      await uploadToS3(uploadUrl, file, setUploadProgress);

      // 4. Trigger MediaConvert transcoding
      setUploadStep('transcoding');
      const transcodeRes = await fetch(`${API}/api/v1/videos/transcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoId: tempId }),
      });
      if (!transcodeRes.ok) throw new Error('Failed to start transcoding');

      // 5. Save video metadata record
      setUploadStep('saving');
      const hlsKey = `videos/hls/${tempId}/index.m3u8`;
      const saveRes = await fetch(`${API}/api/v1/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          accessType: form.accessType,
          price: form.accessType === 'purchase' ? Number(form.price) : undefined,
          thumbnailUrl: form.thumbnailUrl || undefined,
          s3Key: hlsKey,
          // raw upload key saved for reference
          _rawS3Key: key,
        }),
      });
      if (!saveRes.ok) throw new Error('Failed to save video metadata');

      setUploadStep('done');
      setForm({ title: '', description: '', accessType: 'course', price: '', thumbnailUrl: '' });
      setFile(null);
      setShowForm(false);
      setUploadStep('idle');
      setUploadProgress(0);
      await fetchVideos();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadStep('idle');
    }
  }

  async function togglePublish(video: Video) {
    if (!token) return;
    await fetch(`${API}/api/v1/videos/${video._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isPublished: !video.isPublished }),
    });
    await fetchVideos();
  }

  async function deleteVideo(id: string) {
    if (!token || !confirm('Delete this video? This cannot be undone.')) return;
    await fetch(`${API}/api/v1/videos/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchVideos();
  }

  const stepLabel: Record<UploadStep, string> = {
    idle: '',
    uploading: `Uploading… ${uploadProgress}%`,
    transcoding: 'Transcoding with MediaConvert…',
    saving: 'Saving metadata…',
    done: 'Done!',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Videos</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ Upload Video'}
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <form
          onSubmit={handleUpload}
          className="bg-white border rounded-lg p-6 mb-6 space-y-4"
        >
          <h2 className="text-lg font-semibold">Upload New Video</h2>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div>
            <label className="block text-sm font-medium mb-1">Video file</label>
            <input
              type="file"
              accept="video/*"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Access type</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.accessType}
                onChange={(e) =>
                  setForm({ ...form, accessType: e.target.value as typeof form.accessType })
                }
              >
                <option value="course">Course (subscription or purchase)</option>
                <option value="purchase">Purchase only (individual buy)</option>
                <option value="public">Public (YouTube embed replacement)</option>
              </select>
            </div>

            {form.accessType === 'purchase' && (
              <div>
                <label className="block text-sm font-medium mb-1">Price ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  required
                />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">
                Thumbnail URL <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.thumbnailUrl}
                onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>

          {uploadStep !== 'idle' && (
            <div className="text-sm text-blue-600 font-medium">{stepLabel[uploadStep]}</div>
          )}

          <button
            type="submit"
            disabled={uploadStep !== 'idle'}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {uploadStep === 'idle' ? 'Upload' : 'Uploading…'}
          </button>
        </form>
      )}

      {/* Video list */}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : videos.length === 0 ? (
        <p className="text-gray-500">No videos yet.</p>
      ) : (
        <div className="space-y-3">
          {videos.map((v) => (
            <div
              key={v._id}
              className="flex items-center justify-between bg-white border rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-4">
                {v.thumbnailUrl && (
                  <img
                    src={v.thumbnailUrl}
                    alt=""
                    className="w-16 h-10 object-cover rounded"
                  />
                )}
                <div>
                  <p className="font-medium text-sm">{v.title}</p>
                  <p className="text-xs text-gray-500">
                    {v.accessType}
                    {v.accessType === 'purchase' && v.price !== undefined
                      ? ` · $${v.price}`
                      : ''}
                    {' · '}
                    {v.isPublished ? (
                      <span className="text-green-600">Published</span>
                    ) : (
                      <span className="text-yellow-600">Draft</span>
                    )}
                    {!v.s3Key && (
                      <span className="text-orange-500"> · Processing…</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePublish(v)}
                  className={`text-xs px-3 py-1 rounded border ${
                    v.isPublished
                      ? 'border-yellow-400 text-yellow-600 hover:bg-yellow-50'
                      : 'border-green-500 text-green-600 hover:bg-green-50'
                  }`}
                >
                  {v.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <a
                  href={`/watch/${v._id}`}
                  target="_blank"
                  className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  Preview
                </a>
                <button
                  onClick={() => deleteVideo(v._id)}
                  className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// XMLHttpRequest upload so we can track progress
function uploadToS3(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
