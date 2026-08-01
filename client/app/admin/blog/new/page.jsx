'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import BlogEditor from '@/components/BlogEditor';

export default function NewBlogPostPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (form) => {
    setSaving(true);
    setError('');

    try {
      await api.post('/api/v1/blog', {
        title: form.title,
        slug: form.slug,
        mdxContent: form.mdxContent,
        excerpt: form.excerpt,
        author: form.author,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        coverImageUrl: form.coverImageUrl || null,
        isPublished: form.isPublished,
      });
      router.push('/admin/blog');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">New post</h1>
        <Link href="/admin/blog" className="text-sm text-gray-500 hover:underline">
          ← Back
        </Link>
      </div>
      <BlogEditor onSave={handleSave} saving={saving} error={error} />
    </div>
  );
}
