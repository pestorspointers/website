import CmsPage from '@/components/CmsPage';
import { pageMetadata } from '@/lib/pages';

export const revalidate = 60;

export function generateMetadata() {
  return pageMetadata('about', { title: 'About' });
}

export default function AboutPage() {
  return <CmsPage slug="about" />;
}
