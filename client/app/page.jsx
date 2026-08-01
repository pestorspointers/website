import CmsPage from '@/components/CmsPage';
import { pageMetadata } from '@/lib/pages';

export const revalidate = 60;

export function generateMetadata() {
  return pageMetadata('home');
}

export default function HomePage() {
  return <CmsPage slug="home" />;
}
