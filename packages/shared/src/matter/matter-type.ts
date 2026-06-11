import { z } from 'zod';

// Value additions require a DB CHECK replacement migration and API/schema update.
export const matterTypes = [
  'advisory',
  'contract',
  'ma',
  'litigation',
  'arbitration',
  'investigation',
  'compliance',
  'ip',
  'finance',
  'other',
] as const;

export const matterTypeSchema = z.enum(matterTypes);

export type MatterType = (typeof matterTypes)[number];
