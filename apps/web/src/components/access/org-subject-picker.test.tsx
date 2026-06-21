import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { OrgDirectorySubjectDto } from '@amic-vault/shared';
import { OrgSubjectPickerContent } from './org-subject-picker';

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const userSubject = {
  canViewSensitiveRef: false,
  displayEmail: 'alpha.partner@example.test',
  displayName: 'Alpha Partner',
  role: 'matter_owner',
  safeLabel: 'Alpha Partner · alpha.partner@example.test',
  subjectId: '11111111-1111-4111-8111-111111111201',
  subjectType: 'user',
} satisfies OrgDirectorySubjectDto;

const groupSubject = {
  canViewSensitiveRef: false,
  displayName: 'Corporate Team',
  groupType: 'team',
  safeLabel: 'Corporate Team · team',
  subjectId: '11111111-1111-4111-8111-111111111301',
  subjectType: 'group',
} satisfies OrgDirectorySubjectDto;

describe('OrgSubjectPickerContent', () => {
  it('renders display-safe user and group choices without raw subject references', () => {
    const html = renderToStaticMarkup(
      <OrgSubjectPickerContent
        items={[userSubject, groupSubject]}
        onSubjectSelected={() => undefined}
        query="Alpha"
        selectedSubject={groupSubject}
      />,
    );

    expect(html).toContain('Alpha Partner · alpha.partner@example.test');
    expect(html).toContain('Corporate Team · team');
    expect(html).toContain('사용자');
    expect(html).toContain('그룹');
    expect(html).not.toContain(userSubject.subjectId);
    expect(html).not.toContain(groupSubject.subjectId);
    expect(html).not.toContain('사용자 ID');
    expect(html).not.toContain('그룹 ID');
    expect(html).not.toContain('memberCount');
  });

  it('starts in pre-search state before a bounded query is present', () => {
    const html = renderToStaticMarkup(
      <OrgSubjectPickerContent items={[]} onSubjectSelected={() => undefined} query="A" />,
    );

    expect(html).toContain('두 글자 이상');
    expect(html).not.toContain(userSubject.subjectId);
  });
});
