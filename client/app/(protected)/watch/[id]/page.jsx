import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import WatchClient from './WatchClient';

export default async function WatchPage({ params }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return <WatchClient videoId={params.id} />;
}
