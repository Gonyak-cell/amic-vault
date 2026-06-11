#!/usr/bin/env bash
set -euo pipefail

pnpm db:migrate
before="$(node tools/db/schema-hash.mjs)"
pnpm db:rollback
pnpm db:migrate
after="$(node tools/db/schema-hash.mjs)"

if [[ "$before" != "$after" ]]; then
  echo "migration roundtrip schema hash mismatch" >&2
  echo "before=$before" >&2
  echo "after=$after" >&2
  exit 1
fi

echo "migration roundtrip passed: $after"
