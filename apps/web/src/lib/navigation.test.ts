import { describe, expect, it } from 'vitest';
import { getNavigationGroups } from './navigation';

function labelsForRole(role: Parameters<typeof getNavigationGroups>[0]) {
  return getNavigationGroups(role, 'ko').flatMap((group) => group.items.map((item) => item.label));
}

describe('navigation visibility', () => {
  it('keeps loading navigation fail-closed', () => {
    expect(labelsForRole(undefined)).toEqual(['홈']);
  });

  it('hides admin/security routes from matter members', () => {
    const labels = labelsForRole('matter_member');

    expect(labels).toContain('홈');
    expect(labels).toContain('Matter');
    expect(labels).toContain('문서함');
    expect(labels).toContain('작업함');
    expect(labels).toContain('알림');
    expect(labels).toContain('문서 검색');
    expect(labels).not.toContain('Outlook');
    expect(labels).not.toContain('접근 기록');
    expect(labels).not.toContain('정보 차단');
  });

  it('shows governed admin routes to firm admins without hidden routes', () => {
    const groups = getNavigationGroups('firm_admin', 'ko');
    const labels = groups.flatMap((group) => group.items.map((item) => item.label));

    expect(groups.map((group) => group.label)).toContain('정책 관리');
    expect(groups.map((group) => group.label)).not.toContain('거버넌스');
    expect(labels).toContain('기록 보존');
    expect(labels).toContain('작업함');
    expect(labels).toContain('알림');
    expect(labels).toContain('접근 기록');
    expect(labels).toContain('정보 차단');
    expect(labels).toContain('관리자 설정');
    expect(labels).toContain('Outlook');
    expect(labels).not.toContain('공유 요청');
  });
});
