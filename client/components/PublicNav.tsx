'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSession } from 'next-auth/react';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/courses', label: 'Courses' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export default function PublicNav() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          <Image
            src="https://kajabi-storefronts-production.kajabi-cdn.com/kajabi-storefronts-production/file-uploads/themes/2155355257/settings_images/ed08b2a-a3e0-3612-d74e-125be7a47_0781e02a-1437-42e4-9456-8938569f0c77.png"
            alt="Pestor's Pointers"
            width={140}
            height={40}
            className="h-10 w-auto object-contain"
            unoptimized
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-700 hover:text-[#f53100] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          {status === 'authenticated' ? (
            <Link
              href="/dashboard"
              className="text-sm font-semibold px-4 py-2 bg-[#f53100] text-white rounded-lg hover:bg-[#d42a00] transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-[#f53100] transition-colors">
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

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 text-gray-700"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-2 py-2 text-sm font-medium text-gray-700 hover:text-[#f53100] transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            {status === 'authenticated' ? (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="block px-2 py-2 text-sm font-semibold text-[#f53100]"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="block px-2 py-2 text-sm font-medium text-gray-700"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="block px-2 py-2 text-sm font-semibold text-[#f53100]"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
