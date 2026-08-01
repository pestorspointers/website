import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/supabase/server';
import SignOutButton from '@/components/SignOutButton';

const navGroups = [
  {
    title: 'Overview',
    links: [{ href: '/admin', label: 'Dashboard' }],
  },
  {
    title: 'Your website',
    links: [
      { href: '/admin/pages', label: 'Pages' },
      { href: '/admin/media', label: 'Images' },
      { href: '/admin/settings', label: 'Site Settings' },
      { href: '/admin/blog', label: 'Blog' },
    ],
  },
  {
    title: 'What you sell',
    links: [
      { href: '/admin/courses', label: 'Courses' },
      { href: '/admin/videos', label: 'Videos' },
      { href: '/admin/subscriptions', label: 'Memberships' },
    ],
  },
  {
    title: 'People',
    links: [{ href: '/admin/users', label: 'Members' }],
  },
];

export default async function AdminLayout({ children }) {
  const profile = await getProfile();

  // The role gate. Middleware only proves someone is signed in — this is what
  // keeps a regular member out of the admin panel.
  if (!profile) redirect('/login?next=/admin');
  if (profile.role !== 'admin') redirect('/dashboard');

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 bg-[#161E2A] text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/10">
          <Link href="/" className="font-bold text-lg block hover:text-[#f53100] transition-colors">
            Admin
          </Link>
          <p className="text-xs text-gray-400 mt-1 truncate">{profile.email}</p>
        </div>

        <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {group.title}
              </p>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-3 py-2 rounded text-sm text-gray-200 hover:bg-white/10 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-1">
          <Link
            href="/"
            className="block px-3 py-2 rounded text-sm text-gray-300 hover:bg-white/10 transition-colors"
          >
            View site ↗
          </Link>
          <SignOutButton className="w-full text-left px-3 py-2 rounded text-sm text-gray-300 hover:bg-white/10 transition-colors" />
        </div>
      </aside>

      <main className="flex-1 bg-gray-50 overflow-auto">
        <div className="p-8 max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
