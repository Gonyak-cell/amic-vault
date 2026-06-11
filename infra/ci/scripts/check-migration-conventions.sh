#!/usr/bin/env bash
set -euo pipefail

node tools/db/check-migration-conventions.mjs "$@"
