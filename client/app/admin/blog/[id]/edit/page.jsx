'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import BlogEditor from '@/components/BlogEditor';

export default function EditBlogPostPage() {
  const { id } = useParams();
  const router = useRouter();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/api/v1/blog/admin/${id}`)
      .then(({ data }) => setPost(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (form) => {
    setSaving(true);
    setError('');

    try {
      await api.patch(`/api/v1/blog/${id}`, {
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

  if (loading) return <p className="text-gray-400">Loading…</p>;
  if (!post) return <p className="text-red-600">{error || 'Post not found.'}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Edit post</h1>
        <Link href="/admin/blog" className="text-sm text-gray-500 hover:underline">
          ← Back
        </Link>
      </div>

      <BlogEditor
        initial={{
          title: post.title,
          slug: post.slug,
          mdxContent: post.mdxContent,
          excerpt: post.excerpt,
          author: post.author,
          tags: (post.tags ?? []).join(', '),
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
