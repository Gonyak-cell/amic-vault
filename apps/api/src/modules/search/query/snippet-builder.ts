import { Injectable } from '@nestjs/common';
import type { SearchHighlightDto } from '@amic-vault/shared';

export const highlightStartMarker = '__AMIC_HL_START__';
export const highlightEndMarker = '__AMIC_HL_END__';

const maxSnippetLength = 200;

export interface ParsedSnippet {
  snippet: string;
  highlights: SearchHighlightDto[];
}

function escapeHtmlChar(char: string): string {
  if (char === '&') return '&amp;';
  if (char === '<') return '&lt;';
  if (char === '>') return '&gt;';
  if (char === '"') return '&quot;';
  if (char === "'") return '&#39;';
  return char;
}

function truncateHighlights(highlights: SearchHighlightDto[], length: number): SearchHighlightDto[] {
  return highlights
    .filter((highlight) => highlight.start < length)
    .map((highlight) => ({ start: highlight.start, end: Math.min(highlight.end, length) }))
    .filter((highlight) => highlight.end > highlight.start);
}

@Injectable()
export class SnippetBuilder {
  headlineSql(contentSql: string, querySql: string): string {
    return `ts_headline('simple', ${contentSql}, ${querySql}, 'StartSel=${highlightStartMarker}, StopSel=${highlightEndMarker}, MaxWords=35, MinWords=5, ShortWord=2, HighlightAll=false, MaxFragments=1')`;
  }

  parseHeadline(value: string | null | undefined): ParsedSnippet {
    const input = value ?? '';
    let output = '';
    const highlights: SearchHighlightDto[] = [];
    let activeStart: number | null = null;
    let index = 0;

    while (index < input.length) {
      if (input.startsWith(highlightStartMarker, index)) {
        activeStart = output.length;
        index += highlightStartMarker.length;
        continue;
      }
      if (input.startsWith(highlightEndMarker, index)) {
        if (activeStart !== null) {
          highlights.push({ start: activeStart, end: output.length });
          activeStart = null;
        }
        index += highlightEndMarker.length;
        continue;
      }

      const codePoint = input.codePointAt(index);
      if (codePoint === undefined) break;
      const char = String.fromCodePoint(codePoint);
      output += escapeHtmlChar(char);
      index += char.length;
    }

    if (output.length <= maxSnippetLength) {
      return { snippet: output, highlights };
    }
    return {
      snippet: output.slice(0, maxSnippetLength),
      highlights: truncateHighlights(highlights, maxSnippetLength),
    };
  }
}
