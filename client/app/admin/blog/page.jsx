'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

export default function AdminBlogPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/v1/blog/admin/all');
      setPosts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const togglePublish = async (post) => {
    try {
      const { data } = await api.patch(`/api/v1/blog/${post.id}`, {
        isPublished: !post.isPublished,
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, isPublished: data.isPublished } : p))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (post) => {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/v1/blog/${post.id}`);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Blog</h1>
          <p className="text-gray-500">Articles for the public blog.</p>
        </div>
        <Link
          href="/admin/blog/new"
          className="shrink-0 px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00]"
        >
          New post
        </Link>
      </div>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : posts.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
          No posts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex items-start justify-between gap-4 bg-white border rounded-lg p-5"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{post.title}</p>
                  {post.isPublished ? (
                    <span className="text-[10px] uppercase bg-green-100 text-green-700 px-2 py-0.5 rounded">
                      Live
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                      Draft
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5 truncate">{post.excerpt}</p>
                <p className="text-xs text-gray-400 mt-1">
                  /blog/{post.slug}
                  {post.author ? ` · ${post.author}` : ''}
                  {post.tags?.length ? ` · ${post.tags.join(', ')}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/admin/blog/${post.id}/edit`}
                  className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => togglePublish(post)}
                  className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
                >
                  {post.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(post)}
                  className="text-xs px-3 py-1.5 border rounded text-red-600 hover:bg-red-50"
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
