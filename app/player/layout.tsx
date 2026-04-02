import { Metadata } from 'next';
import { VideoTogetherScript } from '@/components/VideoTogetherScript';

export const metadata: Metadata = {
    referrer: 'no-referrer',
};

export default function PlayerLayout({
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
