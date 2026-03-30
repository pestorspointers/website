'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password');
      return;
    }

    router.push('/dashboard');
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border">
      <h1 className="text-2xl font-bold mb-6">Sign In</h1>
      {error && (
        <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 rounded">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white py-2 rounded hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      <p className="mt-4 text-sm text-center text-gray-600">
        No account?{' '}
        <Link href="/register" className="underline font-medium">
          Register
        </Link>
      </p>
    </div>
  );
}
