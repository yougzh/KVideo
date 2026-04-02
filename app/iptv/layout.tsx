import { VideoTogetherScript } from '@/components/VideoTogetherScript';

export default function IPTVLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <VideoTogetherScript />
    </>
  );
}
