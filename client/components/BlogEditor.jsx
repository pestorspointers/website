'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';

// Monaco must be dynamically imported (no SSR) — it uses browser APIs
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const DEFAULT_MDX = `# Your Post Title

Write your content here using **Markdown** and MDX components.

## Custom components

Use a YouTube embed:

<YouTube id="dQw4w9WgXcQ" />

Use a callout box:

<CalloutBox type="info">
  This is an informational callout.
</CalloutBox>

\`\`\`javascript
// Code blocks are syntax highlighted
const greet = (name) => \`Hello, \${name}!\`;
\`\`\`
`;

export default function BlogEditor({ initial, onSave, saving, error }) {
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    slug: initial?.slug ?? '',
    excerpt: initial?.excerpt ?? '',
    author: initial?.author ?? '',
    tags: initial?.tags ?? '',
    coverImageUrl: initial?.coverImageUrl ?? '',
    mdxContent: initial?.mdxContent ?? DEFAULT_MDX,
    isPublished: initial?.isPublished ?? false,
  });

  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [tab, setTab] = useState('editor');
  const debounceRef = useRef(null);

  // Debounce preview compilation on MDX change
  useEffect(() => {
    if (tab !== 'preview') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewError('');
      try {
        const res = await fetch('/api/blog/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mdxContent: form.mdxContent }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPreviewError(data.error || 'Compile error');
        } else {
          setPreviewHtml(form.mdxContent);
        }
      } catch {
        setPreviewError('Preview failed');
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.mdxContent, tab]);

  function handleTitleChange(title) {
    setForm((prev) => ({
      ...prev,
      title,
      // Auto-fill slug only if user hasn't manually edited it
      slug: prev.slug === slugify(prev.title) ? slugify(title) : prev.slug,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</p>}

      {/* ── Metadata ─────────────────────────────────────────────── */}
      <div className="bg-white border rounded-lg p-5 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            required
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">
            Slug <span className="text-gray-400 font-normal">(URL path)</span>
          </label>
          <input
            className="w-full border rounded px-3 py-2 text-sm font-mono"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            required
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Excerpt</label>
          <textarea
            className="w-full border rounded px-3 py-2 text-sm"
            rows={2}
            value={form.excerpt}
            onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Author</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={form.author}
            onChange={(e) => setForm({ ...form, author: e.target.value })}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Tags <span className="text-gray-400 font-normal">(comma-separated)</span>
          </label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="mindset, productivity"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">
            Cover Image URL <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={form.coverImageUrl}
            onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
            placeholder="https://..."
          />
        </div>
      </div>

      {/* ── MDX Editor + Preview ──────────────────────────────────── */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setTab('editor')}
            className={`px-4 py-2 text-sm font-medium ${
              tab === 'editor' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Editor
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-4 py-2 text-sm font-medium ${
              tab === 'preview' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Preview (raw MDX)
          </button>
          <div className="ml-auto px-4 py-2 text-xs text-gray-400 flex items-center">
            MDX — use &lt;YouTube id="" /&gt; · &lt;CalloutBox type="info"&gt; · standard markdown
          </div>
        </div>

        {tab === 'editor' ? (
          <MonacoEditor
            height="520px"
            defaultLanguage="markdown"
            value={form.mdxContent}
            onChange={(value) => setForm({ ...form, mdxContent: value ?? '' })}
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              lineNumbers: 'on',
              fontSize: 14,
              tabSize: 2,
              scrollBeyondLastLine: false,
            }}
          />
        ) : (
          <div className="p-4 min-h-[520px]">
            {previewError ? (
              <p className="text-red-600 text-sm font-mono">{previewError}</p>
            ) : (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-6">
                {previewHtml || 'Switch to preview to validate MDX…'}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* ── Publish + save ────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
            className="rounded"
          />
          Publish immediately
        </label>
      </div>
    </form>
  );
}
