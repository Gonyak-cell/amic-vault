-- Up Migration

ALTER TABLE parties
  ADD CONSTRAINT parties_party_type_check
  CHECK (party_type IN ('individual', 'corporation', 'government', 'other')),
  ADD CONSTRAINT parties_party_role_check
  CHECK (
    party_role IN (
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
      'other'
    )
  );

COMMENT ON CONSTRAINT parties_party_type_check ON parties IS
  'Party taxonomy v1 is frozen by MATTER-PARTMANA-PARTREGI-TUW-002; additions require ADR update.';
COMMENT ON CONSTRAINT parties_party_role_check ON parties IS
  'Party role taxonomy v1 is frozen by MATTER-PARTMANA-PARTREGI-TUW-002; additions require ADR update.';

-- Down Migration

ALTER TABLE parties
  DROP CONSTRAINT IF EXISTS parties_party_role_check,
  DROP CONSTRAINT IF EXISTS parties_party_type_check;
