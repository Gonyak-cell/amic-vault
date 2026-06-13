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
    expect(html).toContain('Tenant, email, password로 접속합니다.');
    expect(html).toContain('로그인');
    expect(html).toContain('한국어');
    expect(html).toContain('English');
  });
});
