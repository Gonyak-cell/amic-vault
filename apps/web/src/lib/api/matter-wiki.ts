import type { MatterWikiListDto } from '@amic-vault/shared';
import { apiFetch } from '../api-client';
import { apiBaseUrl } from '../config';

export function listMatterWiki(matterId: string): Promise<MatterWikiListDto> {
  return apiFetch<MatterWikiListDto>(`/matters/${encodeURIComponent(matterId)}/wiki`, {
    redirectOnAuthRequired: false,
  });
}

export function matterWikiExportUrl(matterId: string): string {
  return `${apiBaseUrl()}/matters/${encodeURIComponent(matterId)}/wiki-export`;
}
