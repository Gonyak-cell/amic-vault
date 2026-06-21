'use client';

import type {
  OrgDirectorySubjectListDto,
  OrgDirectorySubjectQueryDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

function queryString(query: Partial<OrgDirectorySubjectQueryDto>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : '';
}

export function searchOrgDirectorySubjects(
  query: Partial<OrgDirectorySubjectQueryDto> &
    Pick<OrgDirectorySubjectQueryDto, 'purpose' | 'q'>,
): Promise<OrgDirectorySubjectListDto> {
  return apiFetch<OrgDirectorySubjectListDto>(`/org-directory/subjects${queryString(query)}`);
}
