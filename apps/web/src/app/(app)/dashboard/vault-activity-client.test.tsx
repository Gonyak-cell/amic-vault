import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VaultActivityClient } from './vault-activity-client';

describe('VaultActivityClient', () => {
  it('renders the business-language Vault dashboard redesign', () => {
    const html = renderToStaticMarkup(<VaultActivityClient />);

    expect(html).toContain('계약 검토 자료실');
    expect(html).toContain('활동 기록');
    expect(html).toContain('새 파일이 추가됨');
    expect(html).toContain('NDA 동의 대기 중');
    expect(html).toContain('선택한 활동');
    expect(html).toContain('접근 권한 보기');
    expect(html).not.toContain('감사 로그');
    expect(html).not.toContain('출시 관리');
    expect(html).not.toContain('선택한 감사 로그');
    expect(html).not.toContain('Gate green');
    expect(html).not.toContain('Amplitude');
    expect(html).not.toContain('Request a demo');
  });
});
