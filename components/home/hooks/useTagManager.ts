import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Tag } from '../SortableTag';
import {
    buildTagUrl,
    DEFAULT_POPULAR_TAG_ID,
    getTagIdFromSearchParams,
    RECOMMEND_TAG_ID,
} from '@/lib/utils/tag-navigation';

const DEFAULT_TAG = { id: DEFAULT_POPULAR_TAG_ID, label: '热门', value: '热门' };

const STORAGE_KEY_PREFIX = 'kvideo_custom_tags_';

const ensureDefaultTag = (tags: Tag[]) => {
    if (tags.some((tag) => tag.id === DEFAULT_TAG.id || tag.value === DEFAULT_TAG.value)) {
        return tags.map((tag) =>
            tag.id === DEFAULT_TAG.id || tag.value === DEFAULT_TAG.value
                ? { ...DEFAULT_TAG, ...tag, id: DEFAULT_TAG.id, value: DEFAULT_TAG.value }
                : tag
        );
    }

    return [DEFAULT_TAG, ...tags];
};

export function useTagManager() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchParamsString = searchParams.toString();

    const [contentType, setContentType] = useState<'movie' | 'tv'>(() => {
        if (typeof window === 'undefined') return 'movie';
        const saved = localStorage.getItem('kvideo_default_content_type');
        return saved === 'tv' ? 'tv' : 'movie';
    });
    const [selectedTag, setSelectedTagState] = useState(() =>
        getTagIdFromSearchParams(
            new URLSearchParams(searchParamsString),
            DEFAULT_TAG.id
        )
    );
    const [tags, setTags] = useState<Tag[]>([]);
    const [isLoadingTags, setIsLoadingTags] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const [showTagManager, setShowTagManager] = useState(false);
    const [justAddedTag, setJustAddedTag] = useState(false);
    const [tagRefreshKey, setTagRefreshKey] = useState(0);

    // Persist content type preference
    useEffect(() => {
        localStorage.setItem('kvideo_default_content_type', contentType);
    }, [contentType]);

    const navigateToTag = useCallback((tagId: string, replace = false) => {
        const nextUrl = buildTagUrl(pathname, searchParamsString, tagId);
        if (nextUrl === `${pathname}${searchParamsString ? `?${searchParamsString}` : ''}`) {
            return;
        }

        if (replace) {
            router.replace(nextUrl, { scroll: false });
        } else {
            router.push(nextUrl, { scroll: false });
        }
    }, [pathname, router, searchParamsString]);

    const setSelectedTag = useCallback((tagId: string) => {
        setSelectedTagState(tagId);
        setTagRefreshKey((current) => current + 1);
        navigateToTag(tagId);
    }, [navigateToTag]);

    const handleContentTypeChange = useCallback((nextType: 'movie' | 'tv') => {
        setContentType(nextType);
        setSelectedTagState(DEFAULT_TAG.id);
        setTagRefreshKey((current) => current + 1);
        navigateToTag(DEFAULT_TAG.id, true);
    }, [navigateToTag]);

    // URL is the source of truth for tag selection, so browser back/forward
    // restores the tag associated with each history entry.
    useEffect(() => {
        const nextTag = getTagIdFromSearchParams(
            new URLSearchParams(searchParamsString),
            DEFAULT_TAG.id
        );
        setSelectedTagState(nextTag);
    }, [searchParamsString]);

    const storageKey = `${STORAGE_KEY_PREFIX}${contentType}`;

    // Load custom tags or fetch from Douban
    useEffect(() => {
        const loadTags = async () => {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                try {
                    const parsedTags = JSON.parse(saved);
                    setTags(Array.isArray(parsedTags) ? ensureDefaultTag(parsedTags) : [DEFAULT_TAG]);
                    return;
                } catch (e) {
                    console.error('Failed to parse saved tags', e);
                }
            }

            // If no saved tags, fetch from Douban
            setIsLoadingTags(true);
            try {
                const response = await fetch(`/api/douban/tags?type=${contentType}`);
                const data = await response.json();
                if (data.tags && Array.isArray(data.tags)) {
                    const mappedTags = data.tags.map((label: string) => ({
                        id: label === '热门' ? 'popular' : `tag_${label}`,
                        label,
                        value: label,
                    }));

                    const cachedTags = ensureDefaultTag(mappedTags);
                    setTags(cachedTags);
                    localStorage.setItem(storageKey, JSON.stringify(cachedTags));
                } else {
                    setTags([DEFAULT_TAG]);
                }
            } catch (error) {
                console.error('Fetch tags error:', error);
                setTags([DEFAULT_TAG]);
            } finally {
                setIsLoadingTags(false);
            }
        };

        loadTags();
    }, [contentType, storageKey]);

    // If a URL points to a tag that no longer exists, replace it with the
    // default without adding another entry to browser history.
    useEffect(() => {
        if (isLoadingTags || tags.length === 0 || selectedTag === RECOMMEND_TAG_ID) {
            return;
        }

        if (!tags.some((tag) => tag.id === selectedTag)) {
            setSelectedTagState(DEFAULT_TAG.id);
            navigateToTag(DEFAULT_TAG.id, true);
        }
    }, [isLoadingTags, navigateToTag, selectedTag, tags]);

    const saveTags = (newTags: Tag[]) => {
        setTags(newTags);
        localStorage.setItem(storageKey, JSON.stringify(newTags));
    };

    const handleAddTag = () => {
        if (!newTagInput.trim()) return;
        const newTag = {
            id: `custom_${Date.now()}`,
            label: newTagInput.trim(),
            value: newTagInput.trim(),
        };
        saveTags([...tags, newTag]);
        setNewTagInput('');
        setJustAddedTag(true);
    };

    const handleDeleteTag = (tagId: string) => {
        if (tagId === DEFAULT_TAG.id) return;

        saveTags(tags.filter(t => t.id !== tagId));
        if (selectedTag === tagId) {
            setSelectedTag(DEFAULT_TAG.id);
        }
    };

    const handleRestoreDefaults = async () => {
        localStorage.removeItem(storageKey);
        // Refresh by re-fetching
        setIsLoadingTags(true);
        try {
            const response = await fetch(`/api/douban/tags?type=${contentType}`);
            const data = await response.json();
            if (data.tags && Array.isArray(data.tags)) {
                const mappedTags = data.tags.map((label: string) => ({
                    id: label === '热门' ? 'popular' : `tag_${label}`,
                    label,
                    value: label,
                }));
                const restoredTags = ensureDefaultTag(mappedTags);
                setTags(restoredTags);
                localStorage.setItem(storageKey, JSON.stringify(restoredTags));
            } else {
                setTags([DEFAULT_TAG]);
            }
        } catch {
            setTags([DEFAULT_TAG]);
        } finally {
            setIsLoadingTags(false);
        }
        setSelectedTag(DEFAULT_TAG.id);
        setShowTagManager(false);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = tags.findIndex((tag) => tag.id === active.id);
            const newIndex = tags.findIndex((tag) => tag.id === over.id);
            saveTags(arrayMove(tags, oldIndex, newIndex));
        }
    };

    return {
        tags,
        selectedTag,
        contentType,
        newTagInput,
        showTagManager,
        justAddedTag,
        isLoadingTags,
        tagRefreshKey,
        setContentType: handleContentTypeChange,
        setSelectedTag,
        setNewTagInput,
        setShowTagManager,
        setJustAddedTag,
        handleAddTag,
        handleDeleteTag,
        handleRestoreDefaults,
        handleDragEnd,
    };
}
