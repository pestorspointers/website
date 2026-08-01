'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Mobile menu. Split out of PublicNav so the nav itself can stay a server
 * component and read the signed-in user without shipping auth code to the
 * browser.
 */
export default function NavMenu({ links, isAuthenticated, isAdmin }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden p-2 text-gray-700"
        aria-label="Toggle menu"
        aria-expanded={open}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="md:hidden absolute left-0 right-0 top-16 bg-white border-t border-gray-100 px-4 py-4 space-y-1 shadow-lg">
          {links.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              onClick={close}
              className="block px-2 py-2 text-sm font-medium text-gray-700 hover:text-[#f53100] transition-colors"
            >
              {link.label}
            </Link>
          ))}

          <div className="pt-3 border-t border-gray-100 space-y-2">
            {isAuthenticated ? (
              <>
                {isAdmin && (
                  <Link href="/admin" onClick={close} className="block px-2 py-2 text-sm font-medium text-gray-700">
                    Admin
                  </Link>
                )}
                <Link href="/dashboard" onClick={close} className="block px-2 py-2 text-sm font-semibold text-[#f53100]">
                  My Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" onClick={close} className="block px-2 py-2 text-sm font-medium text-gray-700">
                  Login
                </Link>
                <Link href="/register" onClick={close} className="block px-2 py-2 text-sm font-semibold text-[#f53100]">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
