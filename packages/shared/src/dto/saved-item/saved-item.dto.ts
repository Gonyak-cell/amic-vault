import { z } from 'zod';

export const savedItemTargetTypes = ['document', 'matter', 'saved_search'] as const;
export const savedItemTargetTypeSchema = z.enum(savedItemTargetTypes);

export const createSavedItemSchema = z
  .object({
    targetType: savedItemTargetTypeSchema,
    targetId: z.string().uuid(),
  })
  .strict();

export const reorderSavedItemsSchema = z
  .object({
    savedItemIds: z
      .array(z.string().uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'saved item ids must be unique'),
  })
  .strict();

export type SavedItemTargetType = (typeof savedItemTargetTypes)[number];
export type CreateSavedItemDto = z.infer<typeof createSavedItemSchema>;
export type ReorderSavedItemsDto = z.infer<typeof reorderSavedItemsSchema>;

export interface SavedItemDto {
  savedItemId: string;
  targetType: SavedItemTargetType;
  targetId: string;
  label: string;
  contextLabel: string | null;
  href: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedItemListDto {
  items: SavedItemDto[];
}
