'use client';

import axios from 'axios';
import { createClient } from './supabase/client';

/**
 * Browser-side client for the API. The interceptor attaches the current
 * Supabase access token to every request, so components never have to think
 * about auth headers.
 *
 * No `baseURL`: the API is served by this same Next app under `/api/v1`, so
 * relative URLs are correct in development and in production alike. That is
 * what `NEXT_PUBLIC_API_URL` used to point at, and it is no longer needed.
 */
const api = axios.create();

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
