import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';

interface Subscription {
  status: 'active' | 'past_due' | 'canceled' | 'none';
  tierId?: { name: string };
  currentPeriodEnd?: string;
}

async function getSubscription(accessToken: string): Promise<Subscription> {
  try {
    const res = await fetch(
      `${process.env.API_URL}/api/v1/payments/subscription`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }
    );
    return await res.json();
  } catch {
    return { status: 'none' };
  }
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const subscription = await getSubscription(session!.user.accessToken);

  const statusColor: Record<string, string> = {
    active: 'text-green-600',
    past_due: 'text-yellow-600',
    canceled: 'text-red-500',
    none: 'text-gray-400',
  };

  return (
    <main className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
      <p className="text-gray-500 mb-8">Welcome back, {session!.user.email}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-6">
          <h2 className="font-semibold mb-2">My Courses</h2>
          <p className="text-sm text-gray-400">No courses yet</p>
        </div>
        <div className="border rounded-lg p-6">
          <h2 className="font-semibold mb-2">My Videos</h2>
          <p className="text-sm text-gray-400">No videos yet</p>
        </div>
        <div className="border rounded-lg p-6">
          <h2 className="font-semibold mb-2">Subscription</h2>
          {subscription.status === 'none' ? (
            <>
              <p className="text-sm text-gray-400">No active subscription</p>
              <Link href="/billing" className="text-sm underline mt-2 inline-block">
                View plans
              </Link>
            </>
          ) : (
            <>
              <p className={`text-sm font-medium capitalize ${statusColor[subscription.status]}`}>
                {subscription.tierId?.name
                  ? `${subscription.tierId.name} — ${subscription.status}`
                  : subscription.status}
              </p>
              {subscription.currentPeriodEnd && (
                <p className="text-xs text-gray-400 mt-1">
                  Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              <Link href="/billing" className="text-sm underline mt-2 inline-block">
                Manage
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
