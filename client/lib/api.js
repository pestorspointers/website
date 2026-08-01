'use client';

import axios from 'axios';
import { createClient } from './supabase/client';

/**
 * Browser-side client for the Express API. The interceptor attaches the
 * current Supabase access token to every request, so components never have to
 * think about auth headers.
 */
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Surface the API's own error message instead of "Request failed with status
// code 400", which is what every form on the site wants to show the user.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ?? error.message ?? 'Something went wrong';
    const wrapped = new Error(message);
    wrapped.status = error.response?.status;
    return Promise.reject(wrapped);
  }
);

export default api;
