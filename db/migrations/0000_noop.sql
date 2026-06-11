-- Up Migration

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Down Migration

-- Keep pgcrypto installed; later migrations and tests may share the extension.
