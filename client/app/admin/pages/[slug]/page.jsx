import { notFound } from 'next/navigation';
import { apiGetAuthed } from '@/lib/serverApi';
import PageEditor from '@/components/admin/PageEditor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return { title: `Editing ${params.slug}` };
}

export default async function AdminPageEditor({ params }) {
  const page = await apiGetAuthed(`/api/v1/pages/admin/${params.slug}`);
  if (!page) notFound();

  return (
    <PageEditor
      page={page}
      previewHref={page.slug === 'home' ? '/' : `/${page.slug}`}
    />
  );
}
