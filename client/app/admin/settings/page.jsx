import { apiGetAuthed } from '@/lib/serverApi';
import SettingsEditor from '@/components/admin/SettingsEditor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Site Settings' };

export default async function AdminSettingsPage() {
  const settings = (await apiGetAuthed('/api/v1/settings/admin/all', { fallback: {} })) ?? {};

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Site Settings</h1>
      <p className="text-gray-500 mb-8">
        Branding, navigation and footer — the parts that appear on every page.
      </p>
      <SettingsEditor initial={settings} />
    </div>
  );
}
