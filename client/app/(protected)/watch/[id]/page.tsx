import { getServerSession } from 'next-auth';
import { authOptions } from '../../../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import WatchClient from './WatchClient';

interface Props {
  params: { id: string };
}

export default async function WatchPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return <WatchClient videoId={params.id} />;
}
