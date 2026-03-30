'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function AdminBlogPage() {
  const { data: session } = useSession();
  const token = session?.user?.accessToken;

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`${API}/api/v1/blog/admin/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setPosts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  async function togglePublish(post) {
    if (!token) return;
    await fetch(`${API}/api/v1/blog/${post._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isPublished: !post.isPublished }),
    });
    await fetchPosts();
  }

  async function deletePost(id) {
    if (!token || !confirm('Delete this post? This cannot be undone.')) return;
    await fetch(`${API}/api/v1/blog/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchPosts();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Blog Posts</h1>
        <Link
          href="/admin/blog/new"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
        >
          + New Post
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="text-gray-500">No posts yet.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post._id}
              className="flex items-start justify-between bg-white border rounded-lg px-4 py-3"
            >
              <div className="flex-1 min-w-0 mr-4">
                <p className="font-medium text-sm truncate">{post.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{post.excerpt}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">/{post.slug}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{post.author}</span>
                  {post.tags.length > 0 && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{post.tags.join(', ')}</span>
                    </>
                  )}
                  <span className="text-xs text-gray-300">·</span>
                  {post.isPublished ? (
                    <span className="text-xs text-green-600">Published</span>
                  ) : (
                    <span className="text-xs text-yellow-600">Draft</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/admin/blog/${post._id}/edit`}
                  className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  Edit
                </Link>
                <button
                  onClick={() => togglePublish(post)}
                  className={`text-xs px-3 py-1 rounded border ${
                    post.isPublished
                      ? 'border-yellow-400 text-yellow-600 hover:bg-yellow-50'
                      : 'border-green-500 text-green-600 hover:bg-green-50'
                  }`}
                >
                  {post.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  onClick={() => deletePost(post._id)}
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
