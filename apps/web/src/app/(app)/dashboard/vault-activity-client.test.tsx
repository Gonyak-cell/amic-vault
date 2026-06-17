import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VaultActivityClient } from './vault-activity-client';

describe('VaultActivityClient', () => {
  it('renders a real-data-only dashboard without mock activity details', () => {
    const html = renderToStaticMarkup(<VaultActivityClient />);

    expect(html).toContain('권한이 확인된 실제 파일과 활동만 표시됩니다.');
    expect(html).toContain('최근 접근 파일');
    expect(html).toContain('최근 활동');
    expect(html).toContain('권한/정책 알림');
    expect(html).toContain('AI Prep 상태');
    expect(html).toContain('통합 상태');
    expect(html).toContain('운영 데이터 연결 상태');
    expect(html).toContain('운영 데이터 연결 대기 중입니다.');
    expect(html).not.toContain('계약 검토 자료실');
    expect(html).not.toContain('새 파일이 추가됨');
    expect(html).not.toContain('NDA 동의 대기 중');
    expect(html).not.toContain('김민준');
    expect(html).not.toContain('정서연');
    expect(html).not.toContain('법무 운영팀');
    expect(html).not.toContain('주식매매계약서');
    expect(html).not.toContain('DOC-204');
    expect(html).not.toContain('ACT-001');
    expect(html).not.toContain('HOLD-017');
    expect(html).not.toContain('18:42');
    expect(html).not.toContain('접근 권한 보기');
    expect(html).not.toContain('감사 로그');
    expect(html).not.toContain('출시 관리');
    expect(html).not.toContain('선택한 감사 로그');
    expect(html).not.toContain('Gate green');
    expect(html).not.toContain('Amplitude');
    expect(html).not.toContain('Request a demo');
  });
});
