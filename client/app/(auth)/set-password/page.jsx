'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Where an invited member finishes signing up. They arrive either with a
 * session cookie already minted by /auth/confirm, or — if the invite went out
 * on Supabase's stock template — with tokens in the URL fragment, which the
 * browser client picks up on its own. Both end in the same place: a session,
 * and a password still to choose.
 */
export default function SetPasswordPage() {
  const router = useRouter();

  const [status, setStatus] = useState('checking'); // checking | ready | invalid
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Read the fragment before anything strips it: a dead invite lands here as
    // #error=access_denied&error_code=otp_expired.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hashError = hash.get('error_description') ?? hash.get('error');

    // getSession() waits on the client's own URL detection, so by the time it
    // resolves any #access_token in the fragment has been turned into a session.
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          setEmail(session.user.email ?? '');
          setFullName(session.user.user_metadata?.full_name ?? '');
          setStatus('ready');
          return;
        }
        setStatus('invalid');
        if (hashError) setError(hashError.replace(/\+/g, ' '));
      });
  }, []);

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

    setSaving(true);
    const supabase = createClient();

    const { data, error: updateError } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName.trim() || null },
    });

    if (updateError) {
      setSaving(false);
      setError(
        updateError.message.toLowerCase().includes('session')
          ? 'That invite link has expired. Ask for a fresh one.'
          : updateError.message
      );
      return;
    }

    // user_metadata does not flow into `profiles` on its own — the sync trigger
    // only runs on insert — so write the name across too.
    if (data?.user && fullName.trim()) {
      await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', data.user.id);
    }

    router.refresh();
    router.push('/dashboard');
  };

  if (status === 'checking') {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border text-center">
        <p className="text-gray-400">Checking your invite…</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm border text-center">
        <h1 className="text-2xl font-bold mb-3">This invite link has expired</h1>
        <p className="text-gray-600 text-sm leading-relaxed">
          {error || 'Invite links can only be opened once, and they do not last forever.'}{' '}
          Ask for a new invite, or reset your password if the account already exists.
        </p>
        <div className="mt-6 flex flex-col gap-2 text-sm">
          <Link href="/forgot-password" className="underline font-medium">
            Send me a password reset link
          </Link>
          <Link href="/login" className="text-gray-500 hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border">
      <h1 className="text-2xl font-bold mb-1">Welcome — set your password</h1>
      <p className="text-sm text-gray-500 mb-6">
        You&apos;re signing in as <strong>{email}</strong>.
      </p>

      {error && <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium mb-1">
            Your name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#f53100]"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            Password
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
            Confirm password
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
          disabled={saving}
          className="w-full bg-[#f53100] text-white py-2 rounded font-semibold hover:bg-[#d42a00] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Create my account'}
        </button>
      </form>
    </div>
  );
}
