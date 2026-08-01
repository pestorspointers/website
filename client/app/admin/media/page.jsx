import MediaLibrary from '@/components/admin/MediaLibrary';

export const metadata = { title: 'Images' };

export default function AdminMediaPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Images</h1>
      <p className="text-gray-500 mb-8">
        Everything you upload here is available in the page editor.
      </p>
      <MediaLibrary />
    </div>
  );
}
