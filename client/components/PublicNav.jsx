import Link from 'next/link';
import { getProfile } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings';
import NavMenu from './NavMenu';

export default async function PublicNav() {
  const [{ brand, nav }, profile] = await Promise.all([getSettings(), getProfile()]);

  const links = nav.links ?? [];
  const isAdmin = profile?.role === 'admin';

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <div className="relative max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="shrink-0">
          {brand.logoUrl ? (
            // Logos come from the admin's media library or an external CDN, so
            // a plain <img> avoids next/image's remote-host allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={brand.siteName}
              className="h-10 w-auto object-contain"
            />
          ) : (
            <span className="font-extrabold text-lg text-[#100566]">{brand.siteName}</span>
          )}
        </Link>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className="text-sm font-medium text-gray-700 hover:text-[#f53100] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {profile ? (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="text-sm font-medium text-gray-700 hover:text-[#f53100] transition-colors"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/dashboard"
                className="text-sm font-semibold px-4 py-2 bg-[#f53100] text-white rounded-lg hover:bg-[#d42a00] transition-colors"
              >
                My Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-700 hover:text-[#f53100] transition-colors"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="text-sm font-semibold px-4 py-2 bg-[#f53100] text-white rounded-lg hover:bg-[#d42a00] transition-colors"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        <NavMenu links={links} isAuthenticated={Boolean(profile)} isAdmin={isAdmin} />
      </div>
    </header>
  );
}
