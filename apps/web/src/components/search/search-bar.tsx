'use client';

import React, { type FormEvent, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

interface SearchBarProps {
  initialQuery: string;
  busy: boolean;
  onSearch: (query: string) => void;
}

export function SearchBar({ initialQuery, busy, onSearch }: SearchBarProps) {
  const { language } = useI18n();
  const [query, setQuery] = useState(initialQuery);
  const copy = language === 'ko'
    ? { label: '파일 검색', placeholder: '계약서, Matter, 키워드 검색', submit: '검색 실행' }
    : { label: 'Search files', placeholder: 'Search contracts, matters, or keywords', submit: 'Run search' };

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || busy) return;
    onSearch(trimmed);
  }

  return (
    <form className="flex gap-2" onSubmit={submit}>
      <Input
        aria-label={copy.label}
        value={query}
        placeholder={copy.placeholder}
        disabled={busy}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Button aria-label={copy.submit} title={copy.submit} type="submit" disabled={busy || !query.trim()}>
        <Search className="h-4 w-4" />
      </Button>
    </form>
  );
}
