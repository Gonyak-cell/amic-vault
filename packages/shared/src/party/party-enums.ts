import { z } from 'zod';

export const partyTypes = ['individual', 'corporation', 'government', 'other'] as const;

export const partyRoles = [
  'client',
  'counterparty',
  'co_counsel',
  'opposing_counsel',
  'target',
  'investor',
  'lender',
  'borrower',
  'guarantor',
  'witness',
  'other',
] as const;

export const partyTypeSchema = z.enum(partyTypes);
export const partyRoleSchema = z.enum(partyRoles);

export type PartyType = (typeof partyTypes)[number];
export type PartyRole = (typeof partyRoles)[number];
