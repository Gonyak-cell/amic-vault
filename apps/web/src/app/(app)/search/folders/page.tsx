import { redirect } from 'next/navigation';
import {
  searchFoldersCompatibilityPath,
  type SearchFoldersSearchParams,
} from './search-folders-client';

/**
 * `/search/folders` remains a deterministic compatibility route for existing
 * bookmarks. Saved-search authorization and execution stay in `/search`.
 */
export default function SearchFoldersPage({
  searchParams = {},
}: {
  searchParams?: SearchFoldersSearchParams;
}) {
  redirect(searchFoldersCompatibilityPath(searchParams));
}
