export const TAG_QUERY_PARAM = 'tag';
export const RECOMMEND_TAG_ID = 'recommend';
export const DEFAULT_POPULAR_TAG_ID = 'popular';

export function getTagIdFromSearchParams(
  searchParams: URLSearchParams,
  fallbackTagId: string
): string {
  return searchParams.get(TAG_QUERY_PARAM)?.trim() || fallbackTagId;
}

export function buildTagUrl(
  pathname: string,
  currentQuery: string,
  tagId: string
): string {
  const params = new URLSearchParams(currentQuery);
  params.set(TAG_QUERY_PARAM, tagId);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
