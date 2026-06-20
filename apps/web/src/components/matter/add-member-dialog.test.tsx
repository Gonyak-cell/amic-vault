import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { AddMemberDialog } from './add-member-dialog';

vi.mock('../ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => <button {...props}>{children}</button>,
}));

vi.mock('../ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const matterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('AddMemberDialog', () => {
  it('renders the permission-scoped org picker add flow by default', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AddMemberDialog matterId={matterId} />
      </LanguageProvider>,
    );

    expect(html).toContain('구성원 추가');
    expect(html).toContain('조직 디렉터리');
    expect(html).toContain('사용자 또는 그룹 검색');
    expect(html).toContain('두 글자 이상');
    expect(html).toContain('역할');
    expect(html).toContain('접근 권한');
    expect(html).not.toContain('구성원 선택 준비 중');
    expect(html).not.toContain('운영 화면에 표시하지 않습니다.');
    expect(html).not.toContain('고급 사용자 참조 입력');
    expect(html).not.toContain('승인된 사용자 참조');
    expect(html).not.toContain('사용자 ID');
    expect(html).not.toContain(matterId);
  });

  it('keeps direct user reference entry behind an explicit advanced flag', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AddMemberDialog matterId={matterId} allowAdvancedReferenceInput />
      </LanguageProvider>,
    );

    expect(html).toContain('고급 사용자 참조 입력');
    expect(html).toContain('승인된 사용자 참조');
    expect(html).toContain('역할');
    expect(html).toContain('접근 권한');
    expect(html).toContain('구성원 추가');
    expect(html).not.toContain('사용자 ID');
    expect(html).not.toContain(matterId);
  });

  it('shows safe denied copy without exposing backend error codes', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <AddMemberDialog matterId={matterId} errorCode="PERMISSION_DENIED" />
      </LanguageProvider>,
    );

    expect(html).toContain('이 작업을 할 권한이 없습니다.');
    expect(html).not.toContain('PERMISSION_DENIED');
  });
});
