import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';

const navLinks = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  { href: '/admin/courses', label: 'Courses' },
  { href: '/admin/videos', label: 'Videos' },
  { href: '/admin/blog', label: 'Blog' },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'admin') redirect('/dashboard');

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <p className="font-bold text-lg">Admin</p>
          <p className="text-xs text-gray-400 mt-1 truncate">
            {session.user.email}
          </p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-3 py-2 rounded text-sm hover:bg-gray-700 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8 bg-gray-50 overflow-auto">{children}</main>
    </div>
  );
}
