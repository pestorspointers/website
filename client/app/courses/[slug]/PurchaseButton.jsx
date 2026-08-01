'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function PurchaseButton({ courseId, slug, isAuthenticated }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buy = async () => {
    // Checkout needs an account to attach the purchase to.
    if (!isAuthenticated) {
      router.push(`/login?next=/courses/${slug}`);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { data } = await api.post(`/api/v1/courses/${courseId}/checkout`);
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={buy}
        disabled={loading}
        className="w-full py-3 bg-[#f53100] text-white font-bold rounded-xl hover:bg-[#d42a00] transition-colors disabled:opacity-50"
      >
        {loading ? 'Opening checkout…' : isAuthenticated ? 'Buy this course' : 'Sign in to buy'}
      </button>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </>
  );
}
