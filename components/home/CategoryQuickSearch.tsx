'use client';

import { Icons } from '@/components/ui/Icon';

interface QuickSearchItem {
  label: string;
  query: string;
}

interface QuickSearchGroup {
  title: string;
  icon: keyof typeof Icons;
  items: QuickSearchItem[];
}

interface CategoryQuickSearchProps {
  onSearch?: (query: string) => void;
}

const currentYear = new Date().getFullYear();

const quickSearchGroups: QuickSearchGroup[] = [
  {
    title: '内容分类',
    icon: 'Film',
    items: [
      { label: '电影', query: '电影' },
      { label: '电视剧', query: '电视剧' },
      { label: '动漫', query: '动漫' },
      { label: '综艺', query: '综艺' },
      { label: '纪录片', query: '纪录片' },
    ],
  },
  {
    title: '电影类型',
    icon: 'Tag',
    items: [
      { label: '动作片', query: '动作片' },
      { label: '喜剧片', query: '喜剧片' },
      { label: '爱情片', query: '爱情片' },
      { label: '科幻片', query: '科幻片' },
      { label: '奇幻片', query: '奇幻片' },
      { label: '恐怖片', query: '恐怖片' },
      { label: '剧情片', query: '剧情片' },
      { label: '战争片', query: '战争片' },
      { label: '动画片', query: '动画片' },
      { label: '悬疑片', query: '悬疑片' },
      { label: '冒险片', query: '冒险片' },
      { label: '犯罪片', query: '犯罪片' },
      { label: '灾难片', query: '灾难片' },
    ],
  },
  {
    title: '年份',
    icon: 'Calendar',
    items: Array.from({ length: 8 }, (_, index) => {
      const year = String(currentYear - index);
      return { label: year, query: year };
    }),
  },
];

export function CategoryQuickSearch({ onSearch }: CategoryQuickSearchProps) {
  if (!onSearch) return null;

  const handleSearch = (query: string) => {
    onSearch(query);
  };

  return (
    <section className="mb-10 space-y-5" aria-label="分类快捷搜索">
      {quickSearchGroups.map((group) => {
        const GroupIcon = Icons[group.icon];

        return (
          <div key={group.title} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-color)]">
              <GroupIcon size={16} className="text-[var(--accent-color)]" />
              <span>{group.title}</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide md:flex-wrap md:overflow-visible">
              {group.items.map((item) => (
                <button
                  key={`${group.title}-${item.label}`}
                  type="button"
                  onClick={() => handleSearch(item.query)}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 text-sm font-semibold text-[var(--text-color)] transition-all duration-200 hover:scale-105 hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] active:scale-95"
                  aria-label={`搜索${item.label}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
