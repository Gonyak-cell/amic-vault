import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SecureRef } from './secure-ref';

const internalRef = '11111111-1111-4111-8111-1111111111aa';

describe('SecureRef', () => {
  it('hides internal refs by default', () => {
    const html = renderToStaticMarkup(
      <dl>
        <SecureRef hiddenText="내부 참조 숨김" label="세션 참조" value={internalRef} />
      </dl>,
    );

    expect(html).toContain('세션 참조');
    expect(html).toContain('내부 참조 숨김');
    expect(html).not.toContain(internalRef);
    expect(html).not.toContain('11111111-1111');
  });

  it('reveals the full ref only when explicitly allowed', () => {
    const html = renderToStaticMarkup(
      <dl>
        <SecureRef label="세션 참조" reveal value={internalRef} />
      </dl>,
    );

    expect(html).toContain('<code');
    expect(html).toContain('font-mono');
    expect(html).toContain(internalRef);
  });

  it('uses the empty copy when no ref exists', () => {
    const html = renderToStaticMarkup(
      <dl>
        <SecureRef emptyText="참조 없음" label="세션 참조" value={null} />
      </dl>,
    );

    expect(html).toContain('참조 없음');
    expect(html).not.toContain('Internal reference hidden');
  });
});
