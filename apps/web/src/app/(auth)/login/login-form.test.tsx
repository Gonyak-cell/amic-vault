import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { LoginForm } from './login-form';

describe('LoginForm', () => {
  it('renders localized login copy and the language toggle', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <LoginForm />
      </LanguageProvider>,
    );

    expect(html).toContain('AMIC Vault');
    expect(html).toContain('워크스페이스 ID, 이메일, 비밀번호로 로그인하세요.');
    expect(html).toContain('워크스페이스 ID');
    expect(html).toContain('이메일');
    expect(html).toContain('비밀번호');
    expect(html).toContain('로그인');
    expect(html).toContain('한국어');
    expect(html).not.toContain('English');
    expect(html).not.toContain('Tenant ID');
  });
});
