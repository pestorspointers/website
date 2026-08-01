'use client';

import { createClient } from './supabase/client';
import api from './api';

/**
 * Uploads an image straight from the browser to Supabase Storage, then records
 * it in the media library so it shows up in the picker.
 *
 * Bypassing the API for the bytes keeps big uploads off the Express server;
 * the storage bucket's RLS policy is what restricts writes to admins.
 */
export async function uploadImage(file) {
  if (!file.type?.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Images need to be under 10 MB. Try resizing it first.');
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'jpg';
  const safeName = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  // A random prefix keeps two uploads of "photo.jpg" from colliding.
  const path = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${
    safeName || 'image'
  }.${extension}`;

  const supabase = createClient();

  const { error } = await supabase.storage.from('media').upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    throw new Error(
      error.message.includes('row-level security')
        ? 'Upload refused — this account is not an admin.'
        : error.message
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('media').getPublicUrl(path);

  const { data } = await api.post('/api/v1/media', {
    storagePath: path,
    url: publicUrl,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  return data;
}
