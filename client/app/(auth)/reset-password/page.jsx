'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Reached from the emailed reset link, which lands on /auth/callback first —
 * so by the time this page renders, the user already has a valid session and
 * updateUser() is all that's left.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Please use at least 8 characters.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(
        updateError.message.includes('session')
          ? 'That reset link has expired. Please request a new one.'
          : updateError.message
      );
      return;
    }

    router.refresh();
    router.push('/dashboard');
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border">
      <h1 className="text-2xl font-bold mb-6">Choose a new password</h1>

      {error && <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f53100]"
            minLength={8}
            required
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium mb-1">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f53100]"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#f53100] text-white py-2 rounded font-semibold hover:bg-[#d42a00] disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </div>
  );
}
