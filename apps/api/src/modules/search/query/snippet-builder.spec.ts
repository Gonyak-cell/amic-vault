import { describe, expect, it } from 'vitest';
import { highlightEndMarker, highlightStartMarker, SnippetBuilder } from './snippet-builder';

describe('SnippetBuilder', () => {
  it('parses headline markers into escaped snippets and highlight offsets', () => {
    const parsed = new SnippetBuilder().parseHeadline(
      `계약 ${highlightStartMarker}해지${highlightEndMarker} <script>alert(1)</script>`,
    );

    expect(parsed.snippet).toBe('계약 해지 &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(parsed.highlights).toEqual([{ start: 3, end: 5 }]);
  });

  it('builds ts_headline SQL with private markers', () => {
    expect(new SnippetBuilder().headlineSql('idx.content_text', 'tsq.query')).toContain(
      'ts_headline',
    );
    expect(new SnippetBuilder().headlineSql('idx.content_text', 'tsq.query')).toContain(
      highlightStartMarker,
    );
  });
});
