'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Course {
  _id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  isPublished: boolean;
  thumbnailUrl?: string;
  videoIds: string[];
  createdAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL;

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function AdminCoursesPage() {
  const { data: session } = useSession();
  const token = (session?.user as { accessToken?: string })?.accessToken;

  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', price: '', thumbnailUrl: '', slug: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchCourses = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`${API}/api/v1/courses/admin/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setCourses(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/v1/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          price: parseFloat(form.price),
          thumbnailUrl: form.thumbnailUrl || undefined,
          slug: form.slug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create course'); return; }
      setForm({ title: '', description: '', price: '', thumbnailUrl: '', slug: '' });
      setShowForm(false);
      await fetchCourses();
    } catch {
      setError('Failed to create course');
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublish(course: Course) {
    if (!token) return;
    await fetch(`${API}/api/v1/courses/${course._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isPublished: !course.isPublished }),
    });
    await fetchCourses();
  }

  async function deleteCourse(id: string) {
    if (!token || !confirm('Delete this course? This cannot be undone.')) return;
    await fetch(`${API}/api/v1/courses/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchCourses();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Courses</h1>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
        >
          {showForm ? 'Cancel' : '+ New Course'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border rounded-lg p-6 mb-6 space-y-4">
          <h2 className="text-lg font-semibold">Create Course</h2>
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value, slug: slugify(e.target.value) })}
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">
                Slug <span className="text-gray-400 font-normal">(auto-generated, editable)</span>
              </label>
              <input
                className="w-full border rounded px-3 py-2 text-sm font-mono"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
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

          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {submitting ? 'Creating…' : 'Create Course'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : courses.length === 0 ? (
        <p className="text-gray-500">No courses yet.</p>
      ) : (
        <div className="space-y-3">
          {courses.map((c) => (
            <div key={c._id} className="flex items-center justify-between bg-white border rounded-lg px-4 py-3">
              <div className="flex items-center gap-4">
                {c.thumbnailUrl && (
                  <img src={c.thumbnailUrl} alt="" className="w-16 h-10 object-cover rounded" />
                )}
                <div>
                  <p className="font-medium text-sm">{c.title}</p>
                  <p className="text-xs text-gray-500">
                    /{c.slug} · ${c.price} · {c.videoIds.length} video(s) ·{' '}
                    {c.isPublished ? (
                      <span className="text-green-600">Published</span>
                    ) : (
                      <span className="text-yellow-600">Draft</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/courses/${c._id}`}
                  className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  Edit
                </Link>
                <button
                  onClick={() => togglePublish(c)}
                  className={`text-xs px-3 py-1 rounded border ${
                    c.isPublished
                      ? 'border-yellow-400 text-yellow-600 hover:bg-yellow-50'
                      : 'border-green-500 text-green-600 hover:bg-green-50'
                  }`}
                >
                  {c.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => deleteCourse(c._id)}
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
