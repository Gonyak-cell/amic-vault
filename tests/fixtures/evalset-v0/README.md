# Evalset v0 Fixture Format

This directory may contain only deidentified JSON evaluation cases. Raw contracts and failed redaction drafts are forbidden.

Use `pnpm evalset:load -- --tenant-id <tenant_uuid> --dir tests/fixtures/evalset-v0` to load fixtures into `evaluation_cases`.

The committed sample is synthetic and intentionally below the 20-case operational target; production R3 Gate notes must record the real reviewed count.
