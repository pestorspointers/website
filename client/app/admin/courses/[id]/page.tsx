'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Video {
  _id: string;
  title: string;
  thumbnailUrl?: string;
  duration?: number;
  accessType: string;
}

interface Course {
  _id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  thumbnailUrl?: string;
  isPublished: boolean;
  videoIds: Video[];
}

interface SubscriptionTier {
  _id: string;
  name: string;
  unlockedCourseIds: string[];
}

const API = process.env.NEXT_PUBLIC_API_URL;

export default function AdminCourseEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const token = (session?.user as { accessToken?: string })?.accessToken;

  const [course, setCourse] = useState<Course | null>(null);
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit form mirrors course fields
  const [form, setForm] = useState({ title: '', description: '', price: '', thumbnailUrl: '', slug: '' });
  // Selected video IDs (ordered list)
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    const [courseRes, videosRes, tiersRes] = await Promise.all([
      fetch(`${API}/api/v1/courses/admin/all`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/v1/videos`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/v1/admin/subscription-tiers`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const coursesData: Course[] = await courseRes.json();
    const found = coursesData.find((c) => c._id === id) ?? null;
    setCourse(found);
    if (found) {
      setForm({
        title: found.title,
        description: found.description,
        price: String(found.price),
        thumbnailUrl: found.thumbnailUrl ?? '',
        slug: found.slug,
      });
      setSelectedVideoIds(found.videoIds.map((v) => v._id));
    }

    const videosData: Video[] = await videosRes.json();
    setAllVideos(videosData);

    const tiersData: SubscriptionTier[] = await tiersRes.json();
    setTiers(tiersData);

    setLoading(false);
  }, [token, id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !course) return;
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const res = await fetch(`${API}/api/v1/courses/${course._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          price: parseFloat(form.price),
          thumbnailUrl: form.thumbnailUrl || undefined,
          slug: form.slug,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Save failed');
        return;
      }
      setSuccess('Course saved.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveVideos() {
    if (!token || !course) return;
    setError('');
    const res = await fetch(`${API}/api/v1/courses/${course._id}/videos`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ videoIds: selectedVideoIds }),
    });
    if (res.ok) setSuccess('Video list saved.');
    else { const d = await res.json(); setError(d.error || 'Failed to save videos'); }
  }

  function toggleVideo(videoId: string) {
    setSelectedVideoIds((prev) =>
      prev.includes(videoId) ? prev.filter((id) => id !== videoId) : [...prev, videoId]
    );
  }

  function moveVideo(index: number, direction: -1 | 1) {
    const next = [...selectedVideoIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSelectedVideoIds(next);
  }

  async function handleTierToggle(tier: SubscriptionTier) {
    if (!token) return;
    const alreadyAssigned = tier.unlockedCourseIds.includes(course!._id);
    const newIds = alreadyAssigned
      ? tier.unlockedCourseIds.filter((cid) => cid !== course!._id)
      : [...tier.unlockedCourseIds, course!._id];

    await fetch(`${API}/api/v1/admin/subscription-tiers/${tier._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unlockedCourseIds: newIds }),
    });
    await load();
    setSuccess('Tier assignment updated.');
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!course) return <p className="text-red-600">Course not found.</p>;

  const assignedVideoObjects = selectedVideoIds
    .map((vid) => allVideos.find((v) => v._id === vid))
    .filter(Boolean) as Video[];

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Course</h1>
        <button onClick={() => router.push('/admin/courses')} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to courses
        </button>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</p>}
      {success && <p className="text-green-600 text-sm bg-green-50 p-3 rounded">{success}</p>}

      {/* ── Metadata ─────────────────────────────────────────────── */}
      <section className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="font-semibold">Details</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm font-mono"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="w-full border rounded px-3 py-2 text-sm"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-sm font-medium mb-1">Thumbnail URL</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.thumbnailUrl}
                onChange={(e) => setForm({ ...form, thumbnailUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? 'Saving…' : 'Save Details'}
          </button>
        </form>
      </section>

      {/* ── Video assignment ─────────────────────────────────────── */}
      <section className="bg-white border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Videos ({selectedVideoIds.length} selected)</h2>
          <button
            onClick={handleSaveVideos}
            className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 text-sm"
          >
            Save Video Order
          </button>
        </div>

        {/* Selected videos — ordered */}
        {assignedVideoObjects.length > 0 && (
          <div className="space-y-1 mb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Course order</p>
            {assignedVideoObjects.map((v, i) => (
              <div key={v._id} className="flex items-center gap-2 bg-blue-50 rounded px-3 py-2 text-sm">
                <span className="text-gray-400 w-5 text-right">{i + 1}.</span>
                <span className="flex-1">{v.title}</span>
                <button onClick={() => moveVideo(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30">↑</button>
                <button onClick={() => moveVideo(i, 1)} disabled={i === assignedVideoObjects.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30">↓</button>
                <button onClick={() => toggleVideo(v._id)} className="text-red-400 hover:text-red-600 ml-1">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* All videos — add/remove */}
        <div className="space-y-1">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">All videos</p>
          {allVideos.length === 0 ? (
            <p className="text-sm text-gray-400">No videos uploaded yet.</p>
          ) : (
            allVideos.map((v) => {
              const selected = selectedVideoIds.includes(v._id);
              return (
                <label key={v._id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleVideo(v._id)}
                    className="rounded"
                  />
                  <span className={selected ? 'font-medium' : ''}>{v.title}</span>
                  <span className="text-xs text-gray-400 ml-auto">{v.accessType}</span>
                </label>
              );
            })
          )}
        </div>
      </section>

      {/* ── Subscription tier assignment ─────────────────────────── */}
      <section className="bg-white border rounded-lg p-6 space-y-3">
        <h2 className="font-semibold">Subscription Tier Access</h2>
        <p className="text-sm text-gray-500">Toggle which tiers unlock this course for subscribers.</p>
        {tiers.length === 0 ? (
          <p className="text-sm text-gray-400">No subscription tiers created yet.</p>
        ) : (
          tiers.map((tier) => {
            const assigned = tier.unlockedCourseIds.includes(course._id);
            return (
              <div key={tier._id} className="flex items-center justify-between border rounded px-4 py-3">
                <div>
                  <p className="font-medium text-sm">{tier.name}</p>
                  <p className="text-xs text-gray-400">
                    {tier.unlockedCourseIds.length} course(s) unlocked
                  </p>
                </div>
                <button
                  onClick={() => handleTierToggle(tier)}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    assigned
                      ? 'border-red-300 text-red-600 hover:bg-red-50'
                      : 'border-green-500 text-green-600 hover:bg-green-50'
                  }`}
                >
                  {assigned ? 'Remove from tier' : 'Add to tier'}
                </button>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
