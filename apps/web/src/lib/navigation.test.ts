import { describe, expect, it } from 'vitest';
import { getNavigationGroups } from './navigation';

function labelsForRole(role: Parameters<typeof getNavigationGroups>[0]) {
  return getNavigationGroups(role, 'ko').flatMap((group) => group.items.map((item) => item.label));
}

describe('navigation visibility', () => {
  it('keeps loading navigation fail-closed', () => {
    expect(labelsForRole(undefined)).toEqual(['홈']);
  });

  it('keeps matter-member primary navigation to five operational entries', () => {
    const labels = labelsForRole('matter_member');

    expect(labels).toEqual(['홈', 'Matter', '고객', '문서함', '작업함']);
    expect(labels).not.toContain('알림');
    expect(labels).not.toContain('문서 검색');
    expect(labels).not.toContain('검색 폴더');
    expect(labels).not.toContain('Outlook');
    expect(labels).not.toContain('접근 기록');
    expect(labels).not.toContain('정보 차단');
  });

  it('uses one admin entry after the five operational entries', () => {
    const groups = getNavigationGroups('firm_admin', 'ko');
    const labels = groups.flatMap((group) => group.items.map((item) => item.label));

    expect(groups.map((group) => group.key)).toEqual(['Vault', 'Admin']);
    expect(labels).toEqual(['홈', 'Matter', '고객', '문서함', '작업함', '관리자 설정']);
  });
});
