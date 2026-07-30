import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { PageHeader } from './page-header';
import { PageShell } from './page-shell';
import { SectionCard } from './section-card';

describe('layout primitives', () => {
  it('keeps page landmarks responsive without nested shell width overflow', () => {
    const html = renderToStaticMarkup(
      <PageShell>
        <section>문서함</section>
      </PageShell>,
    );

    expect(html).toContain('<main');
    expect(html).toContain('min-w-0');
    expect(html).toContain('max-w-[1480px]');
    expect(html).toContain('문서함');
  });

  it('marks the active breadcrumb and keeps page headers title-only', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        actions={<Button type="button">새 문서</Button>}
        breadcrumbs={['Vault', '문서함']}
        title="문서함"
      />,
    );

    expect(html).toContain('aria-label="이동 경로"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('flex-wrap');
    expect(html).toContain('md:flex-row');
    expect(html).toContain('mt-2 max-w-full truncate');
    expect(html).toContain('새 문서');
  });

  it('keeps section title and metadata in one compact header row', () => {
    const html = renderToStaticMarkup(
      <SectionCard
        actions={<Button type="button">재시도</Button>}
        meta="실제 상태 기반"
        title="처리 상태"
      >
        본문 추출 대기
      </SectionCard>,
    );

    expect(html).toContain('overflow-hidden');
    expect(html).toContain('min-w-0');
    expect(html).toContain('flex-wrap');
    expect(html).toContain('justify-end');
    expect(html).toContain('items-baseline');
    expect(html).toContain('gap-2 overflow-hidden');
    expect(html).toContain('실제 상태 기반');
    expect(html).toContain('본문 추출 대기');
  });
});
