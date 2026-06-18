import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DetailInspector,
  DetailInspectorField,
  DetailInspectorSection,
} from './detail-inspector';
import { StatusBadge } from './status-badge';

describe('DetailInspector', () => {
  it('renders an accessible tokenized detail panel', () => {
    const html = renderToStaticMarkup(
      <DetailInspector
        meta="선택한 항목"
        status={<StatusBadge tone="success">사용 가능</StatusBadge>}
        title="상세 정보"
      >
        <DetailInspectorSection description="허용된 표시 정보만 제공합니다." title="기본 정보">
          <dl className="grid gap-3">
            <DetailInspectorField label="이름" value="표시 가능한 항목" />
          </dl>
        </DetailInspectorSection>
      </DetailInspector>,
    );

    expect(html).toContain('<aside');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('rounded-lg');
    expect(html).toContain('bg-card');
    expect(html).toContain('border-b');
    expect(html).toContain('상세 정보');
    expect(html).toContain('사용 가능');
    expect(html).toContain('표시 가능한 항목');
  });

  it('renders empty content without leaking internal references', () => {
    const html = renderToStaticMarkup(
      <DetailInspector empty={<p>선택한 항목이 없습니다.</p>} title="상세 정보" />,
    );

    expect(html).toContain('선택한 항목이 없습니다.');
    expect(html).not.toContain('tenant');
    expect(html).not.toContain('workspace');
    expect(html).not.toContain('model response');
  });
});
