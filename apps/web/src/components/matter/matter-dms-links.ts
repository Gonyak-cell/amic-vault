import type { MatterDto } from '@amic-vault/shared';

export function matterFileCabinetUrl(matter: MatterDto): string {
  return matterFileCabinetContextUrl(matter.matterCode);
}

export function matterFileCabinetContextUrl(matterCode: string, folderId?: string): string {
  const params = new URLSearchParams();
  params.set('matterCode', matterCode);
  if (folderId?.trim()) params.set('folderId', folderId.trim());
  return `/files?${params.toString()}`;
}

export function matterSearchUrl(matter: MatterDto): string {
  const params = new URLSearchParams();
  params.set('matterCode', matter.matterCode);
  params.set('target', 'all');
  params.set('groupBy', 'matter');
  return `/search?${params.toString()}`;
}

export function matterRecordsUrl(matter: MatterDto): string {
  const params = new URLSearchParams();
  params.set('tab', 'holds');
  params.set('matterCode', matter.matterCode);
  return `/records?${params.toString()}`;
}
