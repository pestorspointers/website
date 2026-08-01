import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

export default async function ProtectedLayout({ children }) {
  // The middleware already redirects anonymous visitors; this is the
  // belt-and-braces check in case a route ever escapes the matcher.
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <>
      <PublicNav />
      <main className="min-h-screen bg-gray-50">{children}</main>
      <PublicFooter />
    </>
  );
}
