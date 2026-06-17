export interface DisplayFieldsDto {
  displayName?: string | null;
  displayCode?: string | null;
  displayEmail?: string | null;
  safeLabel?: string | null;
  canViewSensitiveRef?: boolean;
}

export function buildSafeLabel(...parts: Array<string | null | undefined>): string | null {
  const visible = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return visible.length > 0 ? visible.join(' · ') : null;
}
