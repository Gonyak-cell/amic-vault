# Evalset v0 Fixture Format

This directory may contain only deidentified JSON evaluation cases. Raw contracts and failed redaction drafts are forbidden.

Use `pnpm evalset:load -- --tenant-id <tenant_uuid> --dir tests/fixtures/evalset-v0` to load fixtures into `evaluation_cases`.

The committed LAI-18 fixture includes 100 synthetic upload-prep cases plus the
original two retrieval smoke cases. Regenerate the upload-prep set with:

```bash
pnpm evalset:generate-upload-prep
```

The generator is deterministic and may only emit synthetic/deidentified
file-organization prompts, never raw customer text.
