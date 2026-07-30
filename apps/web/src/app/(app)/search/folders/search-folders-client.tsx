/**
 * The old folder URL is still a supported bookmark, but it is no longer a
 * second saved-search surface. Only an opaque saved-search reference may be
 * carried into the canonical Search Workbench.
 */
export type SearchFoldersSearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

const savedSearchRefPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function searchFoldersCompatibilityPath(
  searchParams: SearchFoldersSearchParams = {},
): string {
  const savedSearchRef = firstSearchParam(searchParams.searchRef);
  if (!savedSearchRef || !savedSearchRefPattern.test(savedSearchRef)) return '/search';
  return `/search?searchRef=${encodeURIComponent(savedSearchRef)}`;
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
