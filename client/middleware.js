import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

/**
 * Runs on every matched request to refresh the Supabase session cookie (access
 * tokens are short-lived) and to bounce anonymous visitors away from private
 * routes.
 *
 * Role checks live in `app/admin/layout.jsx` rather than here — the layout has
 * to verify them anyway, and doing it once keeps a single source of truth.
 */

const PRIVATE_PREFIXES = ['/dashboard', '/billing', '/watch', '/admin', '/account'];

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() revalidates against Supabase; do not swap it for getSession(),
  // which trusts the cookie as-is.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPrivate = PRIVATE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isPrivate && !user) {
    const loginUrl = new URL('/login', request.url);
    // Send them where they were headed once they're signed in.
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already signed in? The auth pages have nothing to offer.
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — the session cookie has
     * to be refreshed on normal page requests, not on every .png.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
