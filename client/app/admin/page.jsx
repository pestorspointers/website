import Link from 'next/link';
import { apiGetAuthed } from '@/lib/serverApi';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Dashboard' };

const currency = (cents) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    (cents ?? 0) / 100
  );

function Stat({ label, value, hint }) {
  return (
    <div className="bg-white border rounded-lg p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="text-3xl font-bold mt-2 text-[#161E2A]">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const quickLinks = [
  { href: '/admin/pages', title: 'Edit your website', body: 'Change text, images and sections.' },
  { href: '/admin/courses', title: 'Manage courses', body: 'Create a course and attach videos to it.' },
  { href: '/admin/videos', title: 'Upload a video', body: 'Add a lesson and assign it to a course.' },
  { href: '/admin/users', title: 'See your members', body: 'Who has signed up and what they can access.' },
];

export default async function AdminDashboard() {
  const stats = await apiGetAuthed('/api/v1/admin/stats');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-gray-500 mb-8">A quick look at how things are going.</p>

      {stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <Stat label="Members" value={stats.users} />
          <Stat
            label="Paying"
            value={stats.subscribers}
            hint="Active or trialing subscriptions"
          />
          <Stat label="Revenue" value={currency(stats.revenueCents)} hint="All time" />
          <Stat label="Purchases" value={stats.purchases} />
          <Stat label="Courses" value={stats.courses} />
          <Stat label="Videos" value={stats.videos} />
          <Stat label="Blog posts" value={stats.posts} />
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-10">
          <p className="text-sm text-amber-800">
            Could not reach the API. Check that the server is running and that{' '}
            <code className="bg-amber-100 px-1 rounded">API_URL</code> points at it.
          </p>
        </div>
      )}

      <h2 className="font-bold text-lg mb-3">What would you like to do?</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="bg-white border rounded-lg p-5 hover:border-[#f53100] transition-colors group"
          >
            <p className="font-semibold group-hover:text-[#f53100] transition-colors">
              {link.title}
            </p>
            <p className="text-sm text-gray-500 mt-1">{link.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
