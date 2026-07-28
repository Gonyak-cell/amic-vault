'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  SavedItemDto,
  SavedItemTargetType,
} from '@amic-vault/shared';
import { safeApiErrorMessage } from '@/lib/api/error-messages';
import {
  createSavedItem,
  listSavedItems,
  removeSavedItem,
} from '@/lib/api/saved-items';

export interface SavedItemTarget {
  targetType: SavedItemTargetType;
  targetId: string;
  label: string;
  contextLabel: string | null;
  href: string;
}

function targetKey(targetType: SavedItemTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

function byPosition(left: SavedItemDto, right: SavedItemDto): number {
  return left.position - right.position || left.savedItemId.localeCompare(right.savedItemId);
}

export function useSavedItems() {
  const [items, setItems] = useState<SavedItemDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set());
  const busyKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    listSavedItems()
      .then((result) => {
        if (!active) return;
        setItems([...result.items].sort(byPosition));
        setError(null);
      })
      .catch((caught) => {
        if (!active) return;
        setItems([]);
        setError(safeApiErrorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const indexed = useMemo(
    () =>
      new Map(
        items.map((item) => [targetKey(item.targetType, item.targetId), item] as const),
      ),
    [items],
  );

  const toggle = useCallback(
    async (target: SavedItemTarget) => {
      const key = targetKey(target.targetType, target.targetId);
      if (busyKeysRef.current.has(key)) return;
      busyKeysRef.current.add(key);
      const existing = indexed.get(key);
      setError(null);
      setBusyKeys((current) => new Set(current).add(key));

      if (existing) {
        setItems((current) => current.filter((item) => item.savedItemId !== existing.savedItemId));
        try {
          await removeSavedItem(existing.savedItemId);
        } catch (caught) {
          setItems((current) =>
            current.some((item) => item.savedItemId === existing.savedItemId)
              ? current
              : [...current, existing].sort(byPosition),
          );
          setError(safeApiErrorMessage(caught));
        } finally {
          busyKeysRef.current.delete(key);
          setBusyKeys((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
        }
        return;
      }

      const optimistic: SavedItemDto = {
        savedItemId: `pending:${key}`,
        targetType: target.targetType,
        targetId: target.targetId,
        label: target.label,
        contextLabel: target.contextLabel,
        href: target.href,
        position: items.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setItems((current) => [...current, optimistic].sort(byPosition));
      try {
        const created = await createSavedItem({
          targetType: target.targetType,
          targetId: target.targetId,
        });
        setItems((current) =>
          current
            .map((item) => (item.savedItemId === optimistic.savedItemId ? created : item))
            .sort(byPosition),
        );
      } catch (caught) {
        setItems((current) =>
          current.filter((item) => item.savedItemId !== optimistic.savedItemId),
        );
        setError(safeApiErrorMessage(caught));
      } finally {
        busyKeysRef.current.delete(key);
        setBusyKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [indexed, items],
  );

  return {
    items,
    error,
    loading,
    isSaved: (targetType: SavedItemTargetType, targetId: string) =>
      indexed.has(targetKey(targetType, targetId)),
    isBusy: (targetType: SavedItemTargetType, targetId: string) =>
      busyKeys.has(targetKey(targetType, targetId)),
    toggle,
  };
}
