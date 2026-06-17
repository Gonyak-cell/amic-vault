import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '@/lib/i18n';
import { RecordsGovernanceClient } from './records-governance-client';

describe('RecordsGovernanceClient', () => {
  it('uses governance copy without exposing internal ID or hash labels', () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <RecordsGovernanceClient />
      </LanguageProvider>,
    );

    expect(html).toContain('기록 보존');
    expect(html).toContain('정책 코드');
    expect(html).toContain('보존 정책');
    expect(html).toContain('삭제 금지');
    expect(html).toContain('증명서');
    expect(html).toContain('등록된 보존 정책이 없습니다.');
    expect(html).not.toContain('파일 ID');
    expect(html).not.toContain('삭제 금지 ID');
    expect(html).not.toContain('삭제 요청 ID');
    expect(html).not.toContain('증명서 ID');
    expect(html).not.toContain('파일 해시');
    expect(html).not.toContain('증명서 해시');
    expect(html).not.toContain('검증값');
    expect(html).not.toContain('RET-INDEFINITE');
    expect(html).not.toContain('Indefinite retention');
    expect(html).not.toContain('CLIENT_RECORDS');
  });
});
