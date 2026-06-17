import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { PasswordResetConfirmPanel } from './password-reset-confirm-form';

describe('PasswordResetConfirmPanel', () => {
  it('renders the activation form without exposing the reset token', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <PasswordResetConfirmPanel token="secret-reset-token" />
      </LanguageProvider>,
    );

    expect(html).toContain('AMIC Vault');
    expect(html).toContain('새 비밀번호를 설정하면 계정이 활성화됩니다.');
    expect(html).toContain('새 비밀번호');
    expect(html).toContain('비밀번호 확인');
    expect(html).toContain('계정 활성화');
    expect(html).toContain('한국어');
    expect(html).toContain('English');
    expect(html).not.toContain('secret-reset-token');
  });
});
