'use client';

import React from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SavedItemToggleProps {
  busy?: boolean;
  className?: string;
  onToggle: () => void;
  saved: boolean;
  showText?: boolean;
  targetLabel: string;
}

export function SavedItemToggle({
  busy = false,
  className,
  onToggle,
  saved,
  showText = true,
  targetLabel,
}: SavedItemToggleProps) {
  const action = saved ? '즐겨찾기 해제' : '즐겨찾기 추가';
  return (
    <Button
      aria-label={`${targetLabel} ${action}`}
      aria-pressed={saved}
      className={className}
      disabled={busy}
      onClick={onToggle}
      size="sm"
      type="button"
      variant="outline"
    >
      <Star
        aria-hidden="true"
        className={cn('h-4 w-4', saved && 'fill-current text-primary')}
      />
      {showText ? action : null}
    </Button>
  );
}
