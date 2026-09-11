'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

/** A "one per line" textarea as the list of features stored on the plan. */
const toLines = (text) =>
  String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const money = (amount) => `$${Number(amount ?? 0).toFixed(2)}`;

const EMPTY_FORM = { name: '', description: '', priceMonthly: '', priceAnnual: '', features: '' };

/**
 * Membership plans. Each one is a recurring subscription that unlocks
 * whichever courses are ticked below it.
 *
 * Plans save to the database straight away and connect to Stripe once
 * payments are set up, so the catalogue can be built before that happens.
 */
export default function AdminSubscriptionsPage() {
  const [tiers, setTiers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    Promise.all([
      api.get('/api/v1/admin/subscription-tiers'),
      api.get('/api/v1/courses/admin/all'),
    ])
      .then(([tierRes, courseRes]) => {
        setTiers(tierRes.data);
        setCourses(courseRes.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const flash = (message) => {
    setStatus(message);
    setTimeout(() => setStatus(''), 2500);
  };

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);

    try {
      const { data } = await api.post('/api/v1/admin/subscription-tiers', {
        name: form.name,
        description: form.description,
        priceMonthly: Number(form.priceMonthly),
        priceAnnual: form.priceAnnual === '' ? null : Number(form.priceAnnual),
        features: toLines(form.features),
        displayOrder: tiers.length,
      });
      setTiers((prev) => [...prev, data]);
      if (data.stripeWarning) setNotice(data.stripeWarning);
      setForm(EMPTY_FORM);
      setCreating(false);
      flash('Plan created');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const update = async (tier, patch) => {
    setError('');
    setNotice('');
    try {
      const { data } = await api.patch(`/api/v1/admin/subscription-tiers/${tier.id}`, patch);
      setTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, ...data } : t)));
      if (data.stripeWarning) setNotice(data.stripeWarning);
      flash('Saved');
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleCourse = (tier, courseId) => {
    const courseIds = tier.courseIds?.includes(courseId)
      ? tier.courseIds.filter((c) => c !== courseId)
      : [...(tier.courseIds ?? []), courseId];

    update(tier, { courseIds });
  };

  const retire = async (tier) => {
    if (
      !confirm(
        `Retire "${tier.name}"? Existing subscribers keep their access, but nobody new can sign up.`
      )
    ) {
      return;
    }

    try {
      await api.delete(`/api/v1/admin/subscription-tiers/${tier.id}`);
      setTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, isActive: false } : t)));
    } catch (err) {
      setError(err.message);
    }
  };

  // Active plans that nobody can buy yet because Stripe isn't connected.
  const notOnStripe = tiers.filter((t) => t.isActive && !t.stripeSynced).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Memberships</h1>
          <p className="text-gray-500">
            Recurring plans. Set the price and what’s included, then tick the courses each plan
            unlocks.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status && <span className="text-sm text-green-600">{status}</span>}
          <button
            type="button"
            onClick={() => setCreating(!creating)}
            className="px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00]"
          >
            {creating ? 'Cancel' : 'New plan'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </p>
      )}

      {notice && (
        <p className="mb-4 p-3 bg-amber-50 text-amber-800 text-sm rounded border border-amber-200">
          {notice}
        </p>
      )}

      {notOnStripe > 0 && (
        <p className="mb-4 p-3 bg-amber-50 text-amber-800 text-sm rounded border border-amber-200">
          {notOnStripe === 1 ? '1 plan isn’t' : `${notOnStripe} plans aren’t`} connected to
          Stripe yet, so members can’t subscribe to {notOnStripe === 1 ? 'it' : 'them'}. Plans
          connect automatically once Stripe is set up. Nothing here will need redoing.
        </p>
      )}

      {creating && (
        <form onSubmit={create} className="bg-white border rounded-lg p-6 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Monthly Membership"
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              What’s included (one per line)
            </label>
            <textarea
              rows={4}
              value={form.features}
              onChange={(e) => setForm({ ...form, features: e.target.value })}
              placeholder={'All three programs\nNew lessons every month\nCancel anytime'}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Shown as a checklist on the pricing cards.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Monthly price (USD)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.priceMonthly}
                onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Yearly price (USD), optional
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.priceAnnual}
                onChange={(e) => setForm({ ...form, priceAnnual: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-[#161E2A] text-white text-sm rounded hover:bg-black disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create plan'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : tiers.length === 0 ? (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
          No membership plans yet.
        </div>
      ) : (
        <div className="space-y-4">
          {tiers.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              courses={courses}
              onUpdate={update}
              onToggleCourse={toggleCourse}
              onRetire={retire}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const toDraft = (tier) => ({
  name: tier.name ?? '',
  description: tier.description ?? '',
  priceMonthly: tier.priceMonthly ?? '',
  priceAnnual: tier.priceAnnual ?? '',
  features: (tier.features ?? []).join('\n'),
});

function TierCard({ tier, courses, onUpdate, onToggleCourse, onRetire }) {
  const [draft, setDraft] = useState(() => toDraft(tier));
  const [open, setOpen] = useState(false);

  // Re-seed the form after a save so it shows what was stored. Keyed on the
  // saved fields only: ticking a course saves immediately and must not wipe
  // edits still being typed above it.
  const savedKey = JSON.stringify([
    tier.name,
    tier.description,
    tier.priceMonthly,
    tier.priceAnnual,
    tier.features,
  ]);
  useEffect(() => {
    setDraft(toDraft(tier));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const set = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });
  const features = tier.features ?? [];

  return (
    <div className={`bg-white border rounded-lg p-6 ${tier.isActive ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg">
            {tier.name}
            {!tier.isActive && (
              <span className="ml-2 text-[10px] uppercase bg-gray-100 text-gray-500 px-2 py-0.5 rounded align-middle">
                Retired
              </span>
            )}
            {tier.isActive && !tier.stripeSynced && (
              <span className="ml-2 text-[10px] uppercase bg-amber-100 text-amber-700 px-2 py-0.5 rounded align-middle">
                Not on Stripe yet
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {money(tier.priceMonthly)}/month
            {tier.priceAnnual ? ` · ${money(tier.priceAnnual)}/year` : ''}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Unlocks {tier.courseIds?.length ?? 0}{' '}
            {tier.courseIds?.length === 1 ? 'course' : 'courses'}
          </p>
          {features.length > 0 && (
            <ul className="mt-2 text-sm text-gray-600 space-y-0.5">
              {features.slice(0, 3).map((feature, i) => (
                <li key={i}>✓ {feature}</li>
              ))}
              {features.length > 3 && (
                <li className="text-gray-400">+{features.length - 3} more</li>
              )}
            </ul>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
          >
            {open ? 'Close' : 'Edit'}
          </button>
          {tier.isActive ? (
            <button
              type="button"
              onClick={() => onRetire(tier)}
              className="text-xs px-3 py-1.5 border rounded text-red-600 hover:bg-red-50"
            >
              Retire
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onUpdate(tier, { isActive: true })}
              className="text-xs px-3 py-1.5 border rounded text-green-700 hover:bg-green-50"
            >
              Reactivate
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-6 pt-6 border-t space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan name</label>
            <input
              type="text"
              value={draft.name}
              onChange={set('name')}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={draft.description}
              onChange={set('description')}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              What’s included (one per line)
            </label>
            <textarea
              rows={4}
              value={draft.features}
              onChange={set('features')}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Monthly price (USD)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.priceMonthly}
                onChange={set('priceMonthly')}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Yearly price (USD)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.priceAnnual}
                onChange={set('priceAnnual')}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            A new price only applies to new subscribers. People already subscribed keep paying
            what they signed up for. Leave the yearly price empty to offer monthly only.
          </p>

          <button
            type="button"
            onClick={() =>
              onUpdate(tier, {
                name: draft.name,
                description: draft.description,
                features: toLines(draft.features),
                priceMonthly: draft.priceMonthly === '' ? undefined : Number(draft.priceMonthly),
                priceAnnual: draft.priceAnnual === '' ? null : Number(draft.priceAnnual),
              })
            }
            className="px-4 py-2 bg-[#f53100] text-white text-sm font-semibold rounded hover:bg-[#d42a00]"
          >
            Save plan
          </button>

          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Courses included with this plan</p>
            {courses.length === 0 ? (
              <p className="text-sm text-gray-400">No courses to assign yet.</p>
            ) : (
              <div className="space-y-1">
                {courses.map((course) => (
                  <label key={course.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tier.courseIds?.includes(course.id) ?? false}
                      onChange={() => onToggleCourse(tier, course.id)}
                      className="w-4 h-4"
                    />
                    {course.title}
                    {!course.isPublished && <span className="text-xs text-gray-400">(draft)</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
