import Link from 'next/link';
import { Icons } from '@/components/ui/Icon';

interface SourceSetupEmptyStateProps {
  isPremium?: boolean;
}

export function SourceSetupEmptyState({ isPremium = false }: SourceSetupEmptyStateProps) {
  const settingsHref = isPremium
    ? '/premium/settings#premium-sources'
    : '/settings#personal-sources';

  return (
    <div className="text-center py-16 sm:py-20 animate-fade-in">
      <div className="inline-flex items-center justify-center w-24 h-24 sm:w-32 sm:h-32 bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] mb-6 rounded-[var(--radius-full)]">
        <Icons.Link size={52} className="text-[var(--text-color-secondary)]" />
      </div>
      <h3 className="text-2xl sm:text-3xl font-bold text-[var(--text-color)] mb-4">
        尚未配置视频源
      </h3>
      <p className="text-base sm:text-lg text-[var(--text-color-secondary)] mb-6 max-w-xl mx-auto px-4">
        请先添加已获授权、可正常访问的视频源或订阅链接，然后返回搜索。
      </p>
      <Link
        href={settingsHref}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-3 bg-[var(--accent-color)] text-white font-semibold rounded-[var(--radius-2xl)] shadow-[var(--shadow-sm)] hover:brightness-110 active:scale-[0.98] transition-all duration-200"
        data-focusable
      >
        <Icons.Settings size={18} />
        前往设置
      </Link>
    </div>
  );
}
