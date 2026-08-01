'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { uploadImage } from '@/lib/upload';

/**
 * The image control used everywhere in the admin: upload a new file, pick one
 * already in the library, or paste a URL from somewhere else.
 */
export default function ImageField({ value, onChange, label }) {
  const [browsing, setBrowsing] = useState(false);
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  useEffect(() => {
    if (!browsing) return;

    let cancelled = false;
    api
      .get('/api/v1/media')
      .then(({ data }) => !cancelled && setLibrary(data))
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [browsing]);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError('');
    setLoading(true);
    try {
      const media = await uploadImage(file);
      onChange(media.url);
      setLibrary((prev) => [media, ...prev]);
      setBrowsing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div>
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}

      <div className="border rounded-lg p-3 bg-white">
        {value ? (
          <div className="flex gap-3 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="w-28 h-20 object-cover rounded border shrink-0 bg-gray-50"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 truncate mb-2">{value}</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setBrowsing(!browsing)}
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                >
                  Choose from library
                </button>
                <button
                  type="button"
                  onClick={() => onChange('')}
                  className="text-xs px-2 py-1 border rounded text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap items-center">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={loading}
              className="text-sm px-3 py-2 bg-[#161E2A] text-white rounded hover:bg-black disabled:opacity-50"
            >
              {loading ? 'Uploading…' : 'Upload an image'}
            </button>
            <button
              type="button"
              onClick={() => setBrowsing(!browsing)}
              className="text-sm px-3 py-2 border rounded hover:bg-gray-50"
            >
              Choose from library
            </button>
          </div>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="hidden"
        />

        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

        {browsing && (
          <div className="mt-3 border-t pt-3">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto">
              {library.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onChange(item.url);
                    setBrowsing(false);
                  }}
                  className={`rounded border-2 overflow-hidden aspect-square ${
                    value === item.url ? 'border-[#f53100]' : 'border-transparent hover:border-gray-300'
                  }`}
                  title={item.filename}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.altText ?? ''} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {library.length === 0 && (
              <p className="text-xs text-gray-400 py-4 text-center">
                Nothing in the library yet — upload an image to get started.
              </p>
            )}

            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">…or paste an image address</label>
              <input
                type="url"
                defaultValue={value ?? ''}
                onBlur={(e) => onChange(e.target.value.trim())}
                placeholder="https://…"
                className="w-full border rounded px-2 py-1 text-xs"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
