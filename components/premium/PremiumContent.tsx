'use client';

import { TagManager } from '@/components/home/TagManager';
import { MovieGrid } from '@/components/home/MovieGrid';
import { PremiumContentGrid } from './PremiumContentGrid';
import { usePremiumTagManager } from '@/lib/hooks/usePremiumTagManager';
import { usePremiumContent } from '@/lib/hooks/usePremiumContent';
import { usePersonalizedRecommendations } from '@/components/home/hooks/usePersonalizedRecommendations';
import { RECOMMEND_TAG_ID } from '@/lib/utils/tag-navigation';

interface PremiumContentProps {
    onSearch?: (query: string) => void;
}

export function PremiumContent({ onSearch }: PremiumContentProps) {
    const {
        tags,
        selectedTag,
        newTagInput,
        showTagManager,
        justAddedTag,
        setSelectedTag,
        setNewTagInput,
        setShowTagManager,
        setJustAddedTag,
        handleAddTag,
        handleDeleteTag,
        handleRestoreDefaults,
        handleDragEnd,
        tagRefreshKey,
    } = usePremiumTagManager();

    const {
        movies: recommendMovies,
        loading: recommendLoading,
        hasMore: recommendHasMore,
        hasHistory,
        prefetchRef: recommendPrefetchRef,
        loadMoreRef: recommendLoadMoreRef,
    } = usePersonalizedRecommendations(true);

    const effectiveRecommendSelected = hasHistory && selectedTag === RECOMMEND_TAG_ID;

    // Get the category value from selected tag
    const categoryValue = tags.find(t => t.id === selectedTag)?.value || '';

    const {
        videos,
        loading,
        hasMore,
        prefetchRef,
        loadMoreRef,
    } = usePremiumContent(
        effectiveRecommendSelected ? '' : categoryValue,
        selectedTag,
        tagRefreshKey
    );

    const handleVideoClick = (video: any) => {
        if (onSearch) {
            onSearch(video.vod_name || video.title);
        }
    };

    const handleRecommendSelect = () => {
        setSelectedTag(RECOMMEND_TAG_ID);
    };

    const handleRegularTagSelect = (tagId: string) => {
        setSelectedTag(tagId);
    };

    return (
        <div className="animate-fade-in">
            <TagManager
                tags={tags}
                selectedTag={effectiveRecommendSelected ? '' : selectedTag}
                showTagManager={showTagManager}
                newTagInput={newTagInput}
                justAddedTag={justAddedTag}
                onTagSelect={handleRegularTagSelect}
                onTagDelete={handleDeleteTag}
                onToggleManager={() => setShowTagManager(!showTagManager)}
                onRestoreDefaults={handleRestoreDefaults}
                onNewTagInputChange={setNewTagInput}
                onAddTag={handleAddTag}
                onDragEnd={handleDragEnd}
                onJustAddedTagHandled={() => setJustAddedTag(false)}
                recommendTag={hasHistory ? {
                    label: '为你推荐',
                    isSelected: effectiveRecommendSelected,
                    onSelect: handleRecommendSelect,
                } : undefined}
            />

            {effectiveRecommendSelected ? (
                <MovieGrid
                    movies={recommendMovies}
                    loading={recommendLoading}
                    hasMore={recommendHasMore}
                    onMovieClick={handleVideoClick}
                    prefetchRef={recommendPrefetchRef}
                    loadMoreRef={recommendLoadMoreRef}
                />
            ) : (
                <PremiumContentGrid
                    videos={videos}
                    loading={loading}
                    hasMore={hasMore}
                    onVideoClick={handleVideoClick}
                    prefetchRef={prefetchRef}
                    loadMoreRef={loadMoreRef}
                />
            )}
        </div>
    );
}
