'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import BlogEditor from '../../../../components/BlogEditor';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function NewBlogPostPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const token = session?.user?.accessToken;

  async function handleSave(data) {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/v1/blog`, {
        method: 'POST',
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
      if (!res.ok) { setError(result.error || 'Failed to create post'); return; }
      router.push('/admin/blog');
    } catch {
      setError('Failed to create post');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">New Post</h1>
        <button onClick={() => router.push('/admin/blog')} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back
        </button>
      </div>
      <BlogEditor onSave={handleSave} saving={saving} error={error} />
    </div>
  );
}
