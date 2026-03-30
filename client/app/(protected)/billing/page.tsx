'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

interface SubscriptionTier {
  _id: string;
  name: string;
  description: string;
  stripePriceIds: { monthly?: string; annual?: string };
}

interface Subscription {
  status: 'active' | 'past_due' | 'canceled' | 'none';
  tierId?: SubscriptionTier;
  currentPeriodEnd?: string;
}

export default function BillingPage() {
  const { data: session } = useSession();
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user.accessToken}`,
  };

  const fetchData = useCallback(async () => {
    if (!session) return;
    const [subRes, tiersRes] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/subscription`, {
        headers: authHeaders,
      }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/tiers`),
    ]);
    setSubscription(await subRes.json());
    setTiers(await tiersRes.json());
  }, [session]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubscribe = async (tierId: string) => {
    setLoading(tierId);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/create-checkout-session`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ tierId, interval: billingInterval }),
        }
      );
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setLoading(null);
    }
  };

  const handleManage = async () => {
    setLoading('portal');
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/create-portal-session`,
        { method: 'POST', headers: authHeaders }
      );
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setLoading(null);
    }
  };

  const isSubscribed =
    subscription?.status === 'active' || subscription?.status === 'past_due';

  const statusColors: Record<string, string> = {
    active: 'text-green-600',
    past_due: 'text-yellow-600',
    canceled: 'text-red-500',
    none: 'text-gray-400',
  };

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-1">Billing</h1>
      <p className="text-gray-500 mb-8">Manage your subscription</p>

      {isSubscribed ? (
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-lg">
                {subscription?.tierId?.name ?? 'Active Subscription'}
              </h2>
              <p className="text-sm mt-1">
                Status:{' '}
                <span className={`font-medium ${statusColors[subscription?.status ?? 'none']}`}>
                  {subscription?.status}
                </span>
              </p>
              {subscription?.currentPeriodEnd && (
                <p className="text-sm text-gray-500 mt-1">
                  Renews{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={handleManage}
              disabled={loading === 'portal'}
              className="px-4 py-2 border rounded text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {loading === 'portal' ? 'Loading...' : 'Manage Subscription'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-6">
            {(['monthly', 'annual'] as const).map((i) => (
              <button
                key={i}
                onClick={() => setBillingInterval(i)}
                className={`px-4 py-2 rounded text-sm font-medium capitalize transition-colors ${
                  billingInterval === i
                    ? 'bg-black text-white'
                    : 'border hover:bg-gray-50'
                }`}
              >
                {i}
              </button>
            ))}
          </div>

          {tiers.length === 0 ? (
            <p className="text-gray-400 text-sm">No subscription plans available.</p>
          ) : (
            <div className="space-y-4">
              {tiers.map((tier) => {
                const hasPrice =
                  billingInterval === 'annual'
                    ? !!tier.stripePriceIds.annual
                    : !!tier.stripePriceIds.monthly;
                return (
                  <div
                    key={tier._id}
                    className="bg-white border rounded-lg p-6 flex items-center justify-between"
                  >
                    <div>
                      <h3 className="font-semibold text-lg">{tier.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{tier.description}</p>
                    </div>
                    <button
                      onClick={() => handleSubscribe(tier._id)}
                      disabled={!hasPrice || loading === tier._id}
                      className="ml-6 px-5 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40 text-sm whitespace-nowrap"
                    >
                      {loading === tier._id
                        ? 'Loading...'
                        : !hasPrice
                        ? 'Unavailable'
                        : 'Subscribe'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
