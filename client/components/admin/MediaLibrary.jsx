'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { uploadImage } from '@/lib/upload';

export default function MediaLibrary() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    api
      .get('/api/v1/media')
      .then(({ data }) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleFiles = async (event) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setError('');
    setUploading(true);

    for (const file of files) {
      try {
        const media = await uploadImage(file);
        setItems((prev) => [media, ...prev]);
      } catch (err) {
        setError(`${file.name}: ${err.message}`);
      }
    }

    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  };

  const remove = async (item) => {
    if (!confirm(`Delete "${item.filename}"? Any section still using it will lose its image.`)) {
      return;
    }

    try {
      await api.delete(`/api/v1/media/${item.id}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = async (item) => {
    await navigator.clipboard.writeText(item.url);
    setCopied(item.id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00] disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload images'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
        <span className="text-sm text-gray-400">JPG, PNG, WebP or GIF — up to 10 MB each</span>
      </div>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
          No images yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-white border rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.altText ?? item.filename}
                className="w-full aspect-square object-cover bg-gray-50"
              />
              <div className="p-3">
                <p className="text-xs font-medium truncate" title={item.filename}>
                  {item.filename}
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => copy(item)}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 flex-1"
                  >
                    {copied === item.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    className="text-xs px-2 py-1 border rounded text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
