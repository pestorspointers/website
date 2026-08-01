'use client';

import { useState } from 'react';
import api from '@/lib/api';

export default function BillingClient({ tiers, subscription }) {
  const [interval, setInterval] = useState('monthly');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const status = subscription?.status ?? 'none';
  const isSubscribed = status === 'active' || status === 'trialing';
  const hasAnnual = tiers.some((t) => t.stripePriceAnnualId);

  const subscribe = async (tierId) => {
    setError('');
    setBusy(tierId);

    try {
      const { data } = await api.post('/api/v1/payments/create-checkout-session', {
        tierId,
        interval,
      });
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setError('');
    setBusy('portal');

    try {
      const { data } = await api.post('/api/v1/payments/create-portal-session');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-[#161E2A] mb-2">Membership</h1>
      <p className="text-gray-500 mb-8">
        A membership unlocks every course included in the plan, for as long as it&apos;s active.
      </p>

      {error && (
        <p className="mb-6 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {isSubscribed && (
        <div className="bg-white border rounded-2xl p-6 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-[#161E2A]">
              You&apos;re subscribed{subscription?.tier ? ` to ${subscription.tier.name}` : ''}.
            </p>
            {subscription?.currentPeriodEnd && (
              <p className="text-sm text-gray-500 mt-1">
                {subscription.cancelAtPeriodEnd ? 'Access ends' : 'Next payment'} on{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={openPortal}
            disabled={busy === 'portal'}
            className="px-5 py-3 border-2 border-[#100566] text-[#100566] font-semibold rounded-lg hover:bg-[#100566] hover:text-white transition-colors disabled:opacity-50"
          >
            {busy === 'portal' ? 'Opening…' : 'Change card or cancel'}
          </button>
        </div>
      )}

      {tiers.length === 0 ? (
        <div className="bg-white border rounded-2xl p-12 text-center text-gray-500">
          No membership plans are available right now.
        </div>
      ) : (
        <>
          {hasAnnual && (
            <div className="flex justify-center mb-8">
              <div className="inline-flex bg-gray-100 rounded-full p-1">
                {['monthly', 'annual'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setInterval(option)}
                    className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${
                      interval === option ? 'bg-white shadow text-[#161E2A]' : 'text-gray-500'
                    }`}
                  >
                    {option === 'monthly' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            className={`grid gap-6 ${
              tiers.length === 1 ? 'max-w-sm mx-auto' : 'sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {tiers.map((tier) => {
              const price = interval === 'annual' ? tier.priceAnnual : tier.priceMonthly;
              const unavailable =
                interval === 'annual' && !tier.stripePriceAnnualId;
              const isCurrent = subscription?.tier?.id === tier.id;

              return (
                <div
                  key={tier.id}
                  className={`bg-white border-2 rounded-2xl p-7 flex flex-col ${
                    isCurrent ? 'border-[#f53100]' : 'border-gray-200'
                  }`}
                >
                  {isCurrent && (
                    <span className="self-start text-[10px] uppercase tracking-wide bg-[#f53100] text-white px-2 py-1 rounded mb-3">
                      Your plan
                    </span>
                  )}

                  <h2 className="text-xl font-bold text-[#161E2A]">{tier.name}</h2>

                  {price != null && (
                    <p className="text-3xl font-extrabold text-[#100566] mt-3">
                      ${Number(price).toFixed(2)}
                      <span className="text-sm font-medium text-gray-400">
                        /{interval === 'annual' ? 'year' : 'month'}
                      </span>
                    </p>
                  )}

                  <p className="text-sm text-gray-500 mt-3 leading-relaxed">{tier.description}</p>

                  {Array.isArray(tier.features) && tier.features.length > 0 && (
                    <ul className="space-y-2 mt-5">
                      {tier.features.map((feature, i) => (
                        <li key={i} className="text-sm text-gray-600 flex gap-2">
                          <span className="text-[#f53100]">✓</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}

                  {tier.courseCount > 0 && (
                    <p className="text-xs text-gray-400 mt-4">
                      Unlocks {tier.courseCount} {tier.courseCount === 1 ? 'course' : 'courses'}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => subscribe(tier.id)}
                    disabled={busy === tier.id || unavailable || isCurrent}
                    className="mt-auto pt-6 w-full"
                  >
                    <span
                      className={`block w-full text-center py-3 rounded-xl font-bold transition-colors ${
                        isCurrent || unavailable
                          ? 'bg-gray-100 text-gray-400'
                          : 'bg-[#f53100] text-white hover:bg-[#d42a00]'
                      }`}
                    >
                      {isCurrent
                        ? 'Current plan'
                        : unavailable
                          ? 'Not available yearly'
                          : busy === tier.id
                            ? 'Opening checkout…'
                            : 'Choose this plan'}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
