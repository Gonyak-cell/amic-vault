import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SavedItemDto } from '@amic-vault/shared';
import { SavedItemsSection } from './saved-items-section';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const item: SavedItemDto = {
  savedItemId: '11111111-1111-4111-8111-111111111914',
  targetType: 'document',
  targetId: '11111111-1111-4111-8111-111111111114',
  label: '투자계약서 검토본',
  contextLabel: 'AMIC-2026-0001 · Investment Advisory',
  href: '/documents/11111111-1111-4111-8111-111111111114',
  position: 0,
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
};

describe('SavedItemsSection', () => {
  it('renders only server-authorized labels and routes', () => {
    const html = renderToStaticMarkup(<SavedItemsSection items={[item]} />);
    expect(html).toContain('즐겨찾기');
    expect(html).toContain('투자계약서 검토본');
    expect(html).toContain('AMIC-2026-0001 · Investment Advisory');
    expect(html).toContain(`href="${item.href}"`);
    expect(html).toContain('overflow-x-hidden');
    expect(html).not.toContain(item.savedItemId);
  });

  it('uses honest empty and unavailable states', () => {
    const empty = renderToStaticMarkup(<SavedItemsSection items={[]} />);
    const unavailable = renderToStaticMarkup(
      <SavedItemsSection error="PERMISSION_DENIED" items={[]} />,
    );
    expect(empty).toContain('자주 쓰는 문서');
    expect(empty).not.toContain('0건');
    expect(unavailable).toContain('즐겨찾기를 표시할 수 없습니다.');
    expect(unavailable).not.toContain('PERMISSION_DENIED');
  });

  it('uses unique accessible title ids when desktop and drawer rails coexist', () => {
    const html = renderToStaticMarkup(
      <>
        <SavedItemsSection items={[item]} />
        <SavedItemsSection items={[item]} />
      </>,
    );
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
