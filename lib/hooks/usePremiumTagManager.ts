import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tag } from '@/components/home/SortableTag';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { PREMIUM_STORAGE_KEY } from '@/lib/constants/premium-tags';
import { isVideoSourceEnabled } from '@/lib/utils/video-source';
import {
    buildTagUrl,
    getTagIdFromSearchParams,
    RECOMMEND_TAG_ID,
} from '@/lib/utils/tag-navigation';

function readSavedPremiumTags(): Tag[] {
    if (typeof window === 'undefined') return [];

    try {
        const saved = localStorage.getItem(PREMIUM_STORAGE_KEY);
        if (!saved) return [];

        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function usePremiumTagManager() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const searchParamsString = searchParams.toString();

    const [tags, setTags] = useState<Tag[]>(readSavedPremiumTags);
    const [selectedTag, setSelectedTagState] = useState(() =>
        getTagIdFromSearchParams(
            new URLSearchParams(searchParamsString),
            RECOMMEND_TAG_ID
        )
    );
    const [showTagManager, setShowTagManager] = useState(false);
    const [newTagInput, setNewTagInput] = useState('');
    const [justAddedTag, setJustAddedTag] = useState(false);
    const [loading, setLoading] = useState(() => readSavedPremiumTags().length === 0);
    const [tagRefreshKey, setTagRefreshKey] = useState(0);

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

    // URL is the source of truth for tag selection, so browser back/forward
    // restores the tag associated with each history entry.
    useEffect(() => {
        const nextTag = getTagIdFromSearchParams(
            new URLSearchParams(searchParamsString),
            RECOMMEND_TAG_ID
        );
        setSelectedTagState(nextTag);
    }, [searchParamsString]);

    // Fetch tags from API
    useEffect(() => {
        const fetchTags = async () => {
            try {
                if (tags.length === 0) {
                    setLoading(true);
                }
                // We need to send the enabled sources to the API
                // Dynamically import settingsStore to avoid initialization issues
                const { settingsStore } = await import('@/lib/store/settings-store');
                const settings = settingsStore.getSettings();
                const enabledSources = settings.premiumSources.filter(isVideoSourceEnabled);

                const response = await fetch('/api/premium/types', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        sources: enabledSources
                    })
                });

                const data = await response.json();

                if (data.tags && Array.isArray(data.tags)) {
                    // Load saved order from local storage
                    const savedTagsJson = localStorage.getItem(PREMIUM_STORAGE_KEY);
                    if (savedTagsJson) {
                        try {
                            const savedTags = JSON.parse(savedTagsJson);
                            // Merge API tags with saved order
                            // 1. Keep saved tags that still exist in API
                            // 2. Add new API tags to the end
                            const apiTagMap = new Map<string, Tag>();
                            if (Array.isArray(data.tags)) {
                                data.tags.forEach((t: Tag) => apiTagMap.set(t.id, t));
                            }

                            const mergedTags: Tag[] = [];
                            const processedIds = new Set<string>();

                            // Process saved tags
                            if (Array.isArray(savedTags)) {
                                savedTags.forEach((savedTag: Tag) => {
                                    if (apiTagMap.has(savedTag.id)) {
                                        mergedTags.push(apiTagMap.get(savedTag.id)!);
                                        processedIds.add(savedTag.id);
                                    }
                                });
                            }

                            // Add remaining API tags
                            data.tags.forEach((tag: Tag) => {
                                if (!processedIds.has(tag.id)) {
                                    mergedTags.push(tag);
                                }
                            });

                            setTags(mergedTags);
                        } catch (e) {
                            console.error('Failed to parse saved tags', e);
                            setTags(data.tags);
                        }
                    } else {
                        setTags(data.tags);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch premium tags:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchTags();
    }, []);

    useEffect(() => {
        if (loading || tags.length === 0) {
            return;
        }

        if (!tags.some((tag) => tag.id === selectedTag)) {
            setSelectedTagState(RECOMMEND_TAG_ID);
            navigateToTag(RECOMMEND_TAG_ID, true);
        }
    }, [loading, navigateToTag, selectedTag, tags]);

    // Save tags to local storage whenever they change
    useEffect(() => {
        if (tags.length > 0 && !loading) {
            localStorage.setItem(PREMIUM_STORAGE_KEY, JSON.stringify(tags));
        }
    }, [tags, loading]);

    const handleAddTag = () => {
        // Custom tag adding is disabled for dynamic tags mode as we fetch all available tags
        // But we keep the function signature for compatibility
    };

    const handleDeleteTag = (tagId: string) => {
        // Instead of deleting, we could hide it, but for now let's just remove it from the list
        // It will reappear if local storage is cleared or if we implement a "hidden tags" feature
        // For now, simple removal from current view
        const newTags = tags.filter((t) => t.id !== tagId);
        setTags(newTags);

        if (selectedTag === tagId) {
            setSelectedTag(newTags[0]?.id || RECOMMEND_TAG_ID);
        }
    };

    const handleRestoreDefaults = async () => {
        setLoading(true);
        localStorage.removeItem(PREMIUM_STORAGE_KEY);
        try {
            const response = await fetch('/api/premium/types');
            const data = await response.json();
            if (data.tags) {
                setTags(data.tags);
                localStorage.setItem(PREMIUM_STORAGE_KEY, JSON.stringify(data.tags));
                setSelectedTag(RECOMMEND_TAG_ID);
            }
        } catch (error) {
            console.error('Failed to restore tags:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setTags((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    return {
        tags,
        selectedTag,
        newTagInput,
        showTagManager,
        justAddedTag,
        loading,
        tagRefreshKey,
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
