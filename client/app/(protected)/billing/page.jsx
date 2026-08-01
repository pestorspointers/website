import { apiGet, apiGetAuthed } from '@/lib/serverApi';
import BillingClient from './BillingClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Membership' };

export default async function BillingPage() {
  const [tiers, subscription] = await Promise.all([
    apiGet('/api/v1/payments/tiers', { revalidate: 60, fallback: [] }),
    apiGetAuthed('/api/v1/payments/subscription'),
  ]);

  return <BillingClient tiers={tiers ?? []} subscription={subscription} />;
}
