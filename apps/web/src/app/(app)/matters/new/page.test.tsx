import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { OrgDirectorySubjectDto } from '@amic-vault/shared';
import { LanguageProvider } from '@/lib/i18n';
import { buildCreateMatterInput, submitCreateMatter } from './matter-create-contract';
import NewMatterPage from './page';

vi.mock('@/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    code = 'VALIDATION_FAILED';
  },
  createMatter: vi.fn(),
  listClients: vi.fn(),
}));

describe('NewMatterPage', () => {
  it('renders a real matter creation form inside the app shell', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <NewMatterPage />
      </LanguageProvider>,
    );

    expect(html).toContain('새 Matter');
    expect(html).toContain('Matter 기본 정보');
    expect(html).toContain('고객');
    expect(html).toContain('사건 유형');
    expect(html).toContain('생성 템플릿');
    expect(html).toContain('일반 Matter');
    expect(html).toContain('템플릿 적용값');
    expect(html).toContain('접근 범위');
    expect(html).not.toContain('펌 전체 열람');
    expect(html).toContain('기본 접근 범위로 시작합니다.');
    expect(html).toContain('Matter 코드');
    expect(html).toContain('Matter 이름');
    expect(html).toContain('담당 변호사');
    expect(html).toContain('href="/matters"');
    expect(html).not.toContain('href="/integrations/matter-app"');
    expect(html).not.toContain('파일 업로드');
  });

  it('builds a bounded createMatter payload with the selected lead lawyer', () => {
    expect(buildCreateMatterInput(validRestrictedForm, leadLawyerSubject)).toEqual({
      accessScope: 'restricted',
      clientId: '11111111-1111-4111-8111-111111111111',
      confidentialityLevel: 'standard',
      intakeTemplateCode: 'restricted',
      leadLawyerId: '11111111-1111-4111-8111-111111111201',
      matterCode: 'AMIC-2026-1001',
      matterName: '신규 자문',
      matterType: 'advisory',
      practiceGroup: 'corporate',
    });
  });

  it('submits valid form state through createMatter and redirects to the created detail page', async () => {
    const createMatter = vi.fn(async () => ({
      matterId: '22222222-2222-4222-8222-222222222222',
    }));
    const redirect = vi.fn();

    await submitCreateMatter(validRestrictedForm, leadLawyerSubject, createMatter, redirect);

    expect(createMatter).toHaveBeenCalledWith({
      accessScope: 'restricted',
      clientId: '11111111-1111-4111-8111-111111111111',
      confidentialityLevel: 'standard',
      intakeTemplateCode: 'restricted',
      leadLawyerId: '11111111-1111-4111-8111-111111111201',
      matterCode: 'AMIC-2026-1001',
      matterName: '신규 자문',
      matterType: 'advisory',
      practiceGroup: 'corporate',
    });
    expect(redirect).toHaveBeenCalledWith(
      '/matters/22222222-2222-4222-8222-222222222222?created=1',
    );
  });

  it('rejects incomplete form state before calling the API', async () => {
    const createMatter = vi.fn();
    const redirect = vi.fn();

    await expect(
      submitCreateMatter(incompleteForm, null, createMatter, redirect),
    ).rejects.toThrow();

    expect(createMatter).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

const validRestrictedForm = {
  accessScope: 'restricted',
  clientId: '11111111-1111-4111-8111-111111111111',
  intakeTemplateCode: 'restricted',
  matterCode: ' AMIC-2026-1001 ',
  matterName: ' 신규 자문 ',
  matterType: 'advisory',
  practiceGroup: ' corporate ',
} as const;

const incompleteForm = {
  accessScope: 'firm_open',
  clientId: '',
  intakeTemplateCode: 'default_open',
  matterCode: '',
  matterName: '',
  matterType: 'advisory',
  practiceGroup: '',
} as const;

const leadLawyerSubject = {
  canViewSensitiveRef: false,
  displayEmail: 'alpha.partner@example.test',
  displayName: 'Alpha Partner',
  role: 'matter_owner',
  safeLabel: 'Alpha Partner · alpha.partner@example.test',
  subjectId: '11111111-1111-4111-8111-111111111201',
  subjectType: 'user',
} satisfies OrgDirectorySubjectDto;
