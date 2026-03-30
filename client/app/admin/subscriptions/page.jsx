'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

const emptyForm = {
  name: '',
  description: '',
  monthlyPrice: '',
  annualPrice: '',
  displayOrder: '0',
};

export default function AdminSubscriptionsPage() {
  const { data: session } = useSession();
  const [tiers, setTiers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user.accessToken}`,
  };

  const fetchTiers = useCallback(async () => {
    if (!session) return;
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/subscription-tiers`,
      { headers: authHeaders }
    );
    const data = await res.json();
    setTiers(data);
  }, [session]);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/subscription-tiers`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            name: form.name,
            description: form.description,
            prices: {
              monthly: parseFloat(form.monthlyPrice),
              annual: form.annualPrice ? parseFloat(form.annualPrice) : undefined,
            },
            displayOrder: parseInt(form.displayOrder),
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create tier');
        return;
      }
      setForm(emptyForm);
      setShowForm(false);
      fetchTiers();
    } catch {
      setError('Failed to create tier');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (tier) => {
    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/subscription-tiers/${tier._id}`,
      {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ isActive: !tier.isActive }),
      }
    );
    fetchTiers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Subscription Tiers</h1>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 text-sm"
        >
          {showForm ? 'Cancel' : '+ New Tier'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Create Subscription Tier</h2>
          {error && <p className="text-red-600 text-sm mb-3 p-2 bg-red-50 rounded">{error}</p>}
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Tier Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="e.g. Foundation, Premium"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                rows={2}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Monthly Price (USD)</label>
              <input
                type="number"
                value={form.monthlyPrice}
                onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="29.99"
                min="0"
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Annual Price (USD)
                <span className="text-gray-400 font-normal ml-1">optional</span>
              </label>
              <input
                type="number"
                value={form.annualPrice}
                onChange={(e) => setForm({ ...form, annualPrice: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="249.99"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Display Order</label>
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                min="0"
              />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 text-sm"
              >
                {submitting ? 'Creating...' : 'Create Tier'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tiers.length === 0 ? (
        <div className="bg-white border rounded-lg p-10 text-center text-gray-400">
          No subscription tiers yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier) => (
            <div
              key={tier._id}
              className="bg-white border rounded-lg p-5 flex items-start justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold">{tier.name}</h3>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      tier.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {tier.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-2">{tier.description}</p>
                <div className="flex gap-4 text-xs text-gray-400">
                  {tier.stripePriceIds.monthly && <span>Monthly price set</span>}
                  {tier.stripePriceIds.annual && <span>· Annual price set</span>}
                  <span>· {tier.unlockedCourseIds.length} course(s) assigned</span>
                  <span>· Order: {tier.displayOrder}</span>
                </div>
              </div>
              <button
                onClick={() => toggleActive(tier)}
                className={`ml-6 text-sm px-3 py-1 rounded border transition-colors ${
                  tier.isActive
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-green-200 text-green-700 hover:bg-green-50'
                }`}
              >
                {tier.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
