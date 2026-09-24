'use client';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableTag, Tag } from './SortableTag';
import { useMemo, useState, useEffect } from 'react';
import { Icons } from '@/components/ui/Icon';

const VISIBLE_TAG_LIMIT = 24;

interface RecommendTagConfig {
    label: string;
    isSelected: boolean;
    onSelect: () => void;
}

interface TagListProps {
    tags: Tag[];
    selectedTag: string;
    showTagManager: boolean;
    justAddedTag: boolean;
    onTagSelect: (tagId: string) => void;
    onTagDelete: (tagId: string) => void;
    onDragEnd: (event: DragEndEvent) => void;
    onJustAddedTagHandled: () => void;
    recommendTag?: RecommendTagConfig;
}

export function TagList({
    tags,
    selectedTag,
    showTagManager,
    justAddedTag,
    onTagSelect,
    onTagDelete,
    onDragEnd,
    onJustAddedTagHandled,
    recommendTag,
}: TagListProps) {
    const [tagFilter, setTagFilter] = useState('');
    const [showAllTags, setShowAllTags] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const normalizedFilter = tagFilter.trim().toLowerCase();
    const filteredTags = useMemo(
        () => tags.filter(tag => tag.label.toLowerCase().includes(normalizedFilter)),
        [normalizedFilter, tags]
    );
    const visibleTags = useMemo(
        () => ((showAllTags || justAddedTag) ? filteredTags : filteredTags.slice(0, VISIBLE_TAG_LIMIT)),
        [filteredTags, justAddedTag, showAllTags]
    );
    const canToggleAllTags = filteredTags.length > VISIBLE_TAG_LIMIT;

    useEffect(() => {
        if (!justAddedTag) return;
        onJustAddedTagHandled();
    }, [justAddedTag, onJustAddedTagHandled]);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        onDragEnd(event);
    };

    const activeTag = tags.find((t) => t.id === activeId);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="mb-8 flex flex-wrap items-center gap-3 pt-2 px-1">
                {/* Recommendation Tag — non-draggable, rendered before sortable tags */}
                {recommendTag && (
                    <div className="relative flex-shrink-0">
                        <button
                            type="button"
                            onClick={recommendTag.onSelect}
                            className={`
                                px-6 py-2.5 text-sm font-semibold transition-all whitespace-nowrap rounded-[var(--radius-full)] cursor-pointer select-none flex items-center gap-1.5
                                ${recommendTag.isSelected
                                    ? 'bg-[var(--accent-color)] text-white shadow-md scale-105'
                                    : 'bg-[var(--glass-bg)] backdrop-blur-xl text-[var(--text-color)] border border-[var(--glass-border)] hover:border-[var(--accent-color)] hover:scale-105'
                                }
                            `}
                        >
                            <Icons.Sparkles size={14} />
                            {recommendTag.label}
                        </button>
                    </div>
                )}
                {tags.length > 12 && (
                    <div className="relative w-full sm:w-64">
                        <Icons.Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-color-secondary)] pointer-events-none"
                        />
                        <input
                            type="search"
                            value={tagFilter}
                            onChange={(event) => setTagFilter(event.target.value)}
                            placeholder="搜索标签"
                            aria-label="搜索标签"
                            className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-full)] text-[var(--text-color)] placeholder:text-[var(--text-color-secondary)] outline-none focus:border-[var(--accent-color)]"
                        />
                    </div>
                )}

                {filteredTags.length === 0 ? (
                    <p className="w-full py-3 text-sm text-[var(--text-color-secondary)]">
                        没有匹配的标签
                    </p>
                ) : (
                    <>
                        <SortableContext
                            items={visibleTags.map((t) => t.id)}
                            strategy={rectSortingStrategy}
                        >
                            {visibleTags.map((tag) => (
                                <SortableTag
                                    key={tag.id}
                                    tag={tag}
                                    selectedTag={selectedTag}
                                    showTagManager={showTagManager}
                                    onTagSelect={onTagSelect}
                                    onTagDelete={onTagDelete}
                                />
                            ))}
                        </SortableContext>

                        {canToggleAllTags && (
                            <button
                                type="button"
                                onClick={() => setShowAllTags((current) => !current)}
                                aria-expanded={showAllTags || justAddedTag}
                                className="px-4 py-2.5 text-sm font-semibold text-[var(--accent-color)] border border-[var(--glass-border)] rounded-[var(--radius-full)] hover:border-[var(--accent-color)] transition-colors"
                            >
                                {(showAllTags || justAddedTag) ? '收起标签' : `显示全部 (${filteredTags.length})`}
                            </button>
                        )}
                    </>
                )}
            </div>

            <DragOverlay>
                {activeId && activeTag ? (
                    <div className="relative flex-shrink-0 animate-jiggle">
                        <button className="px-6 py-2.5 text-sm font-semibold whitespace-nowrap rounded-[var(--radius-full)] bg-[var(--accent-color)] text-white shadow-xl scale-110 cursor-grabbing border border-transparent">
                            {activeTag.label}
                        </button>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
