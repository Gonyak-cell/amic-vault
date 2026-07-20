# Evaluation Set v0 Collection Procedure

Status: R3 technical procedure
Scope: deidentified closed-matter contract examples for search and local AI golden-set evaluation

## Selection Criteria

- Select at least 30 closed Matter contract documents before claiming the local AI golden-set gate.
- Expand the set toward 100 labeled cases as the technical target.
- Use Korean-language contracts only for v0.
- Exclude scanned image PDFs when text redaction cannot be verified.
- Do not import raw originals into this repository.
- If fewer than 20 safe cases are available, proceed only with a recorded Gate note explaining the shortfall.

## Deidentification Rules

Remove or replace every occurrence of the following before a file reaches `tests/fixtures/evalset-v0/`:

- Korean resident registration numbers.
- Passport numbers.
- Alien registration numbers.
- Bank account numbers.
- Payment card numbers.
- Party names, company names, law firm names, individual names, addresses, registration numbers, signature blocks, stamps, phone numbers, and email addresses.

Use stable placeholders such as `[PARTY_A]`, `[COMPANY_B]`, `[ADDRESS_1]`, `[SIGNATURE_REMOVED]`, and `[ACCOUNT_REMOVED]`. Preserve legal concepts, clauses, and search-relevant wording only after deidentification.

## Two-Person Review

- The deidentifier and reviewer must be different people.
- The reviewer checks the raw source against the deidentified case outside the repo.
- The reviewer records only the approved deidentified case number and approval date in the secure review log. Do not commit that log here.

## Golden Labels

- A lawyer reviewer labels each approved case with `expectedAnswerFacts` and `expectedCitationDocumentIds`.
- `expectedAnswerFacts` contains only deidentified fact statements that a correct answer must recover.
- `expectedCitationDocumentIds` contains only authorized document UUIDs from the tenant database; do not use file names, customer names, or raw matter names.
- The initial manual gate requires at least 30 labeled cases. The target corpus for regression stability is 100 labeled cases.

## Import Format

Place only deidentified JSON fixtures under `tests/fixtures/evalset-v0/`.

Each `*.json` file must be either one case object or an array of case objects:

```json
{
  "caseNo": "EV-0001",
  "sourceDocRef": "doc:closed-contract-0001",
  "caseType": "contract_search",
  "queryText": "termination notice period clause",
  "expectedRefs": ["doc:closed-contract-0001"],
  "expectedAnswerFacts": [
    "termination notice must be sent 30 days before termination"
  ],
  "expectedCitationDocumentIds": [
    "11111111-1111-4111-8111-111111111101"
  ],
  "deidentified": true,
  "notes": "synthetic or reviewed deidentified text only"
}
```

Rules:

- `caseNo` is unique per tenant.
- `sourceDocRef` and every `expectedRefs` entry are references, not raw file names containing client names.
- Every `expectedAnswerFacts` entry must be deidentified and supportable from the expected citation documents.
- Every `expectedCitationDocumentIds` entry must be a UUID for a document the test tenant may cite.
- `queryText` must not contain names, addresses, account/card numbers, phone numbers, email addresses, signatures, or raw matter identifiers.
- Raw source files, failed deidentification drafts, and reviewer notes are never committed.

## Disposal And Quarantine

- If any identifier is found, stop import immediately.
- Move the failed deidentified draft to the secure quarantine location outside the repo.
- Delete local working copies after the reviewer confirms the replacement case.
- Record the short technical reason in the R3 Gate notes without copying the sensitive value.

## Loader

Run:

```bash
pnpm evalset:load -- --tenant-id <tenant_uuid> --dir tests/fixtures/evalset-v0
```

The loader performs identifier-pattern checks before insert, runs in one transaction, and refuses the entire batch on the first hygiene failure.
