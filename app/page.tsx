import { HomePageClient } from '@/components/home/HomePageClient';

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = q?.trim() || '';

  return <HomePageClient key={query} initialQuery={query} />;
}
