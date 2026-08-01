'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', price: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/api/v1/courses/admin/all')
      .then(({ data }) => setCourses(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const { data } = await api.post('/api/v1/courses', {
        title: form.title,
        description: form.description,
        price: Number(form.price) || 0,
      });
      setCourses((prev) => [{ ...data, videoCount: 0 }, ...prev]);
      setForm({ title: '', description: '', price: '' });
      setCreating(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (course) => {
    try {
      const { data } = await api.patch(`/api/v1/courses/${course.id}`, {
        isPublished: !course.isPublished,
      });
      setCourses((prev) =>
        prev.map((c) => (c.id === course.id ? { ...c, isPublished: data.isPublished } : c))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Courses</h1>
          <p className="text-gray-500">
            A course is what people buy. Attach videos to it and only buyers can watch them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(!creating)}
          className="shrink-0 px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00]"
        >
          {creating ? 'Cancel' : 'New course'}
        </button>
      </div>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {creating && (
        <form onSubmit={create} className="bg-white border rounded-lg p-6 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Course name</label>
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
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Price (USD)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="w-40 border rounded px-3 py-2 text-sm"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              A matching product is created in Stripe automatically.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-[#161E2A] text-white text-sm rounded hover:bg-black disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create course'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
          No courses yet. Create your first one above.
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map((course) => (
            <div
              key={course.id}
              className="bg-white border rounded-lg p-5 flex items-center gap-5"
            >
              {course.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.thumbnailUrl}
                  alt=""
                  className="w-24 h-16 object-cover rounded shrink-0"
                />
              ) : (
                <div className="w-24 h-16 bg-gray-100 rounded shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold truncate">{course.title}</h2>
                  {!course.isPublished && (
                    <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                      Draft
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  ${Number(course.price).toFixed(2)} · {course.videoCount}{' '}
                  {course.videoCount === 1 ? 'video' : 'videos'} · /courses/{course.slug}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => togglePublished(course)}
                  className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                >
                  {course.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <Link
                  href={`/admin/courses/${course.id}`}
                  className="text-xs px-3 py-1.5 bg-[#161E2A] text-white rounded hover:bg-black"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
