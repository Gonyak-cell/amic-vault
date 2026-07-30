'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export const matterDetailTabKeys = ['overview', 'documents', 'work', 'team', 'activity'] as const;
export type MatterDetailTabKey = (typeof matterDetailTabKeys)[number];

export interface MatterDetailTabPanels {
  overview: React.ReactNode;
  documents: React.ReactNode;
  work: React.ReactNode;
  team: React.ReactNode;
  activity: React.ReactNode;
}

interface MatterDetailTabDefinition {
  key: MatterDetailTabKey;
  label: string;
  panelId: string;
  hashes: readonly string[];
}

const matterDetailTabs: readonly MatterDetailTabDefinition[] = [
  {
    key: 'overview',
    label: '개요',
    panelId: 'matter-overview',
    hashes: [
      'matter-overview',
      'matter-dashboard',
      'matter-related',
      'matter-issues',
      'matter-conflicts',
      'matter-closing',
      'matter-governance',
      'matter-parties',
      'matter-ai',
      'matter-knowledge',
      'matter-graph',
      'matter-citations',
      'matter-wiki',
    ],
  },
  {
    key: 'documents',
    label: '문서',
    panelId: 'matter-files',
    hashes: ['matter-documents', 'matter-files'],
  },
  {
    key: 'work',
    label: '업무',
    panelId: 'matter-work',
    hashes: [
      'matter-work',
      'matter-workstreams',
    ],
  },
  {
    key: 'team',
    label: '팀',
    panelId: 'matter-team',
    hashes: ['matter-team'],
  },
  {
    key: 'activity',
    label: '활동',
    panelId: 'matter-activity',
    hashes: ['matter-activity'],
  },
] as const;

const tabByKey = new Map(matterDetailTabs.map((tab) => [tab.key, tab]));
const tabByHash = new Map(
  matterDetailTabs.flatMap((tab) => tab.hashes.map((hash) => [hash, tab.key] as const)),
);

export function parseMatterDetailTab(input: {
  hash?: string | null;
  query?: string | URLSearchParams | null;
  fallback?: MatterDetailTabKey;
}): MatterDetailTabKey {
  const hash = input.hash?.replace(/^#/, '').trim().toLowerCase();
  const hashTab = hash ? tabByHash.get(hash) : undefined;
  if (hashTab) return hashTab;

  const params =
    typeof input.query === 'string'
      ? new URLSearchParams(input.query.replace(/^\?/, ''))
      : input.query;
  const queryTab = params?.get('tab')?.trim().toLowerCase();
  if (queryTab && tabByKey.has(queryTab as MatterDetailTabKey)) {
    return queryTab as MatterDetailTabKey;
  }

  return input.fallback ?? 'overview';
}

export function matterDetailTabPanelId(tab: MatterDetailTabKey): string {
  return tabByKey.get(tab)?.panelId ?? 'matter-overview';
}

export function MatterDetailTabs({
  initialTab,
  panels,
}: {
  initialTab?: string | null;
  panels: MatterDetailTabPanels;
}) {
  const initialTabKey = parseMatterDetailTab({
    query: initialTab ? `tab=${encodeURIComponent(initialTab)}` : null,
  });
  const [activeTab, setActiveTab] = useState<MatterDetailTabKey>(initialTabKey);
  const tabRefs = useRef<Partial<Record<MatterDetailTabKey, HTMLButtonElement | null>>>({});

  const selectTab = useCallback((nextTab: MatterDetailTabKey, replace = false) => {
    setActiveTab(nextTab);
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    if (nextTab === 'overview') url.searchParams.delete('tab');
    else url.searchParams.set('tab', nextTab);
    url.hash = matterDetailTabPanelId(nextTab);
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ matterDetailTab: nextTab }, '', url);
  }, []);

  const syncFromLocation = useCallback((focus = false) => {
    if (typeof window === 'undefined') return;
    const nextTab = parseMatterDetailTab({
      hash: window.location.hash,
      query: window.location.search,
    });
    setActiveTab(nextTab);
    if (focus) {
      window.requestAnimationFrame(() => {
        tabRefs.current[nextTab]?.focus({ preventScroll: true });
        const hashTarget = window.location.hash.replace(/^#/, '');
        if (hashTarget) {
          document.getElementById(hashTarget)?.scrollIntoView({ block: 'start' });
        }
      });
    }
  }, []);

  useEffect(() => {
    const hasDeepLink =
      Boolean(window.location.hash) || Boolean(new URLSearchParams(window.location.search).get('tab'));
    syncFromLocation(hasDeepLink);
    const handleLocationChange = () => syncFromLocation(true);
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [syncFromLocation]);

  function moveFocus(currentTab: MatterDetailTabKey, direction: 1 | -1): void {
    const currentIndex = matterDetailTabKeys.indexOf(currentTab);
    const nextIndex =
      (currentIndex + direction + matterDetailTabKeys.length) % matterDetailTabKeys.length;
    const nextTab = matterDetailTabKeys[nextIndex] ?? matterDetailTabKeys[0];
    selectTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, tab: MatterDetailTabKey) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveFocus(tab, 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveFocus(tab, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      selectTab(matterDetailTabKeys[0]);
      tabRefs.current[matterDetailTabKeys[0]]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      const lastTab = matterDetailTabKeys[matterDetailTabKeys.length - 1] ?? matterDetailTabKeys[0];
      selectTab(lastTab);
      tabRefs.current[lastTab]?.focus();
    }
  }

  return (
    <section className="grid gap-4" aria-label="Matter 기본 탭">
      <div
        className="flex min-w-0 overflow-x-auto border-b"
        role="tablist"
        aria-label="Matter 기본 탭"
      >
        {matterDetailTabs.map((tab) => {
          const selected = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              ref={(element) => {
                tabRefs.current[tab.key] = element;
              }}
              type="button"
              role="tab"
              id={`${tab.key}-tab`}
              aria-selected={selected}
              aria-controls={tab.panelId}
              tabIndex={selected ? 0 : -1}
              className={cn(
                'min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
              )}
              onClick={() => selectTab(tab.key)}
              onKeyDown={(event) => onTabKeyDown(event, tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {matterDetailTabs.map((tab) => (
        <section
          key={tab.key}
          id={tab.panelId}
          role="tabpanel"
          aria-labelledby={`${tab.key}-tab`}
          tabIndex={-1}
          hidden={activeTab !== tab.key}
          className="grid min-w-0 gap-4 scroll-mt-6"
        >
          {activeTab === tab.key ? panels[tab.key] : null}
        </section>
      ))}
    </section>
  );
}
