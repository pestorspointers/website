import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <>
      <PublicNav />
      <main className="min-h-screen">{children}</main>
      <PublicFooter />
    </>
  );
}
