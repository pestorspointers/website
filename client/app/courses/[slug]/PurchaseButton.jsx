'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function PurchaseButton({ courseId, price }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePurchase() {
    if (status === 'unauthenticated') {
      router.push('/login?redirect=/courses');
      return;
    }

    const token = session?.user?.accessToken;
    if (!token) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API}/api/v1/courses/${courseId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Checkout failed'); return; }
      window.location.href = data.url;
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handlePurchase}
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Redirecting…' : `Buy for $${price.toFixed(2)}`}
      </button>
      {error && <p className="text-red-600 text-xs text-center">{error}</p>}
    </div>
  );
}
