'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import BlogEditor from '../../../../../components/BlogEditor';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function EditBlogPostPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const token = session?.user?.accessToken;

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/v1/blog/admin/all`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((posts) => {
        const found = posts.find((p) => p._id === id) ?? null;
        setPost(found);
        setLoading(false);
      });
  }, [token, id]);

  async function handleSave(data) {
    if (!token || !post) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/v1/blog/${post._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: data.title,
          slug: data.slug,
          mdxContent: data.mdxContent,
          excerpt: data.excerpt,
          author: data.author,
          tags: data.tags.split(',').map((t) => t.trim()).filter(Boolean),
          coverImageUrl: data.coverImageUrl || undefined,
          isPublished: data.isPublished,
        }),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error || 'Failed to save'); return; }
      router.push('/admin/blog');
    } catch {
      setError('Failed to save post');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!post) return <p className="text-red-600">Post not found.</p>;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Edit Post</h1>
        <button onClick={() => router.push('/admin/blog')} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back
        </button>
      </div>
      <BlogEditor
        initial={{
          title: post.title,
          slug: post.slug,
          mdxContent: post.mdxContent,
          excerpt: post.excerpt,
          author: post.author,
          tags: post.tags.join(', '),
          coverImageUrl: post.coverImageUrl ?? '',
          isPublished: post.isPublished,
        }}
        onSave={handleSave}
        saving={saving}
        error={error}
      />
    </div>
  );
}
