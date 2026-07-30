import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { LoginForm, navigateAfterLogin, restoreAuthenticatedLogin } from './login-form';

describe('LoginForm', () => {
  it('renders localized login copy and the language toggle', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <LoginForm />
      </LanguageProvider>,
    );

    expect(html).toContain('AMIC Vault');
    expect(html).toContain('계정 또는 이메일과 비밀번호를 입력하세요.');
    expect(html).toContain('계정 또는 이메일');
    expect(html).not.toContain('워크스페이스 ID');
    expect(html).toContain('로그인');
    expect(html).not.toContain('디자인 테마 보기');
    expect(html).toContain('한국어');
    expect(html).toContain('영어');
    expect(html).toContain('<select');
  });

  it('replaces the login entry with one sanitized destination after success', () => {
    const replacements: string[] = [];

    navigateAfterLogin(
      '?next=%2Fdocuments%2F11111111-1111-4111-8111-111111111201%3Fedit%3D1',
      (destination) => replacements.push(destination),
    );
    navigateAfterLogin('?next=%2Flogin', (destination) => replacements.push(destination));

    expect(replacements).toEqual([
      '/documents/11111111-1111-4111-8111-111111111201?edit=1',
      '/dashboard',
    ]);
  });

  it('replaces a restored login entry only after the current session is confirmed', async () => {
    const replacements: string[] = [];

    await expect(
      restoreAuthenticatedLogin(
        '?next=%2Fwork%3Fview%3Dnotifications%26assignee%3Dmine',
        async () => ({ userId: 'confirmed-user' }),
        (destination) => replacements.push(destination),
      ),
    ).resolves.toBe(true);
    await expect(
      restoreAuthenticatedLogin(
        '?next=%2Fwork',
        async () => {
          throw new Error('AUTH_REQUIRED');
        },
        (destination) => replacements.push(destination),
      ),
    ).resolves.toBe(false);

    expect(replacements).toEqual(['/work?view=notifications&assignee=mine']);
  });
});
