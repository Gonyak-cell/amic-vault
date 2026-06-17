import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import FilesPage from './page';

describe('FilesPage', () => {
  it('renders only an API-unavailable empty state before the files API is connected', () => {
    const html = renderToStaticMarkup(<FilesPage />);

    expect(html).toContain('파일');
    expect(html).toContain('파일 목록을 표시할 수 없습니다.');
    expect(html).toContain('이 영역은 아직 운영 데이터와 연결되지 않았습니다.');
    expect(html).not.toContain('DOC-');
    expect(html).not.toContain('Matter ID');
    expect(html).not.toContain('파일 ID');
    expect(html).not.toMatch(/>0</);
  });
});
