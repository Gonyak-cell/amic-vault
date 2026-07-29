import React, { type FormEvent, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { SearchMode } from '@amic-vault/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

interface SearchBarProps {
  initialQuery: string;
  busy: boolean;
  mode?: SearchMode;
  onModeChange?: (mode: SearchMode) => void;
  onSearch: (query: string) => void;
}

const searchModeLabels = {
  keyword: '키워드',
  semantic: '의미',
  hybrid: '혼합',
} as const satisfies Record<SearchMode, string>;

const searchModeDescriptions = {
  keyword: '입력한 단어가 포함된 문서를 찾습니다.',
  semantic: '표현이 달라도 뜻이 비슷한 문서를 찾습니다.',
  hybrid: '키워드와 의미 검색 결과를 함께 찾습니다.',
} as const satisfies Record<SearchMode, string>;

const searchModeOptions: SearchMode[] = ['keyword', 'semantic', 'hybrid'];

export function searchSubmissionQuery(
  query: string,
  busy: boolean,
  composing: boolean,
): string | null {
  const trimmed = query.trim();
  return !trimmed || busy || composing ? null : trimmed;
}

export function SearchBar({
  initialQuery,
  busy,
  mode = 'keyword',
  onModeChange,
  onSearch,
}: SearchBarProps) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const composingRef = useRef(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = searchSubmissionQuery(query, busy, composingRef.current);
    if (!nextQuery) return;
    onSearch(nextQuery);
  }

  return (
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
      <div className="flex min-w-0 flex-1 gap-2">
        <Input
          aria-label={t('search.label')}
          value={query}
          placeholder={t('search.placeholder')}
          disabled={busy}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          aria-label={t('search.submit')}
          title={t('search.submit')}
          type="submit"
          disabled={busy || !query.trim()}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <div
        aria-label="검색 방식"
        className="flex shrink-0 rounded-md border bg-background p-0.5"
        role="group"
      >
        {searchModeOptions.map((option) => (
          <Button
            key={option}
            aria-label={`${searchModeLabels[option]} 검색`}
            aria-pressed={mode === option}
            title={searchModeDescriptions[option]}
            className="h-8 px-3"
            disabled={busy}
            size="sm"
            type="button"
            variant={mode === option ? 'default' : 'ghost'}
            onClick={() => onModeChange?.(option)}
          >
            {searchModeLabels[option]}
          </Button>
        ))}
      </div>
    </form>
  );
}
