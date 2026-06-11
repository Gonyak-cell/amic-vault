import { z } from 'zod';

export const clientTypes = ['corporation', 'individual', 'government', 'fund', 'npo', 'other'] as const;
export const clientStatuses = ['active', 'dormant', 'closed'] as const;
export const clientConfidentialityLevels = ['standard', 'high', 'restricted'] as const;

export type ClientType = (typeof clientTypes)[number];
export type ClientStatus = (typeof clientStatuses)[number];
export type ClientConfidentialityLevel = (typeof clientConfidentialityLevels)[number];

export const clientTypeSchema = z.enum(clientTypes);
export const clientStatusSchema = z.enum(clientStatuses);
export const clientConfidentialityLevelSchema = z.enum(clientConfidentialityLevels);
