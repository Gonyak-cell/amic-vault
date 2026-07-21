-- Up Migration

ALTER TABLE graph_nodes
  ADD COLUMN provenance text NOT NULL DEFAULT 'derived',
  ADD COLUMN review_status text DEFAULT 'confirmed',
  ADD COLUMN created_by_kind text NOT NULL DEFAULT 'system';

UPDATE graph_nodes
SET provenance = 'derived',
  review_status = coalesce(review_status, 'confirmed'),
  created_by_kind = 'system',
  updated_at = now()
WHERE provenance <> 'derived'
  OR review_status IS NULL
  OR created_by_kind <> 'system';

ALTER TABLE graph_nodes
  ADD CONSTRAINT graph_nodes_provenance_check CHECK (
    provenance IN ('derived', 'ai_proposed', 'human_confirmed')
  ),
  ADD CONSTRAINT graph_nodes_review_status_check CHECK (
    review_status IS NULL OR review_status IN ('proposed', 'confirmed')
  ),
  ADD CONSTRAINT graph_nodes_created_by_kind_check CHECK (
    created_by_kind IN ('system', 'ai', 'human')
  ),
  ADD CONSTRAINT graph_nodes_ai_proposed_review_status_check CHECK (
    provenance <> 'ai_proposed' OR review_status IS NOT NULL
  );

GRANT UPDATE (
  provenance,
  review_status,
  created_by_kind
) ON graph_nodes TO vault_app;

-- Down Migration

ALTER TABLE graph_nodes
  DROP CONSTRAINT IF EXISTS graph_nodes_ai_proposed_review_status_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_created_by_kind_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_review_status_check,
  DROP CONSTRAINT IF EXISTS graph_nodes_provenance_check;

ALTER TABLE graph_nodes
  DROP COLUMN IF EXISTS created_by_kind,
  DROP COLUMN IF EXISTS review_status,
  DROP COLUMN IF EXISTS provenance;
