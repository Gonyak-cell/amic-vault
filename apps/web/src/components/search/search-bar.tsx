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
  const { t } = useI18n();
  const [query, setQuery] = useState(initialQuery);

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
        aria-label={t('search.label')}
        value={query}
        placeholder={t('search.placeholder')}
        disabled={busy}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Button aria-label={t('search.submit')} title={t('search.submit')} type="submit" disabled={busy || !query.trim()}>
        <Search className="h-4 w-4" />
      </Button>
    </form>
  );
}
