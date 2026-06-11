-- Up Migration

CREATE TABLE tenants (
  tenant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL
);

-- Down Migration

DROP TABLE IF EXISTS tenants;
