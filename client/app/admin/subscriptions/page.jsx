'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

/**
 * Membership plans. Each one is a recurring Stripe subscription that unlocks
 * whichever courses are ticked below it.
 */
export default function AdminSubscriptionsPage() {
  const [tiers, setTiers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    priceMonthly: '',
    priceAnnual: '',
  });

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
    setSaving(true);

    try {
      const { data } = await api.post('/api/v1/admin/subscription-tiers', {
        name: form.name,
        description: form.description,
        priceMonthly: Number(form.priceMonthly),
        priceAnnual: form.priceAnnual ? Number(form.priceAnnual) : undefined,
        displayOrder: tiers.length,
      });
      setTiers((prev) => [...prev, { ...data, courseIds: [] }]);
      setForm({ name: '', description: '', priceMonthly: '', priceAnnual: '' });
      setCreating(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const update = async (tier, patch) => {
    setError('');
    try {
      const { data } = await api.patch(`/api/v1/admin/subscription-tiers/${tier.id}`, patch);
      setTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, ...data } : t)));
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

  const deactivate = async (tier) => {
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

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Memberships</h1>
          <p className="text-gray-500">
            Recurring plans. Tick the courses each plan should unlock.
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

      {creating && (
        <form onSubmit={create} className="bg-white border rounded-lg p-6 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Plan name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Monthly price (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.priceMonthly}
                onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Yearly price (USD) — optional
              </label>
              <input
                type="number"
                min="0"
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
              onDeactivate={deactivate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TierCard({ tier, courses, onUpdate, onToggleCourse, onDeactivate }) {
  const [draft, setDraft] = useState(tier);
  const [open, setOpen] = useState(false);

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
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            ${Number(tier.priceMonthly ?? 0).toFixed(2)}/month
            {tier.priceAnnual ? ` · $${Number(tier.priceAnnual).toFixed(2)}/year` : ''}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Unlocks {tier.courseIds?.length ?? 0}{' '}
            {tier.courseIds?.length === 1 ? 'course' : 'courses'}
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
          >
            {open ? 'Close' : 'Edit'}
          </button>
          {tier.isActive && (
            <button
              type="button"
              onClick={() => onDeactivate(tier)}
              className="text-xs px-3 py-1.5 border rounded text-red-600 hover:bg-red-50"
            >
              Retire
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
              value={draft.name ?? ''}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={draft.description ?? ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Monthly price (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.priceMonthly ?? ''}
                onChange={(e) => setDraft({ ...draft, priceMonthly: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Yearly price (USD)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.priceAnnual ?? ''}
                onChange={(e) => setDraft({ ...draft, priceAnnual: e.target.value })}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="text-xs text-gray-400">
            Changing a price creates a new price in Stripe. People already subscribed keep paying
            what they signed up for.
          </p>

          <button
            type="button"
            onClick={() =>
              onUpdate(tier, {
                name: draft.name,
                description: draft.description,
                priceMonthly: draft.priceMonthly === '' ? undefined : Number(draft.priceMonthly),
                priceAnnual: draft.priceAnnual === '' ? undefined : Number(draft.priceAnnual),
                isActive: draft.isActive,
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
                    {!course.isPublished && (
                      <span className="text-xs text-gray-400">(draft)</span>
                    )}
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
