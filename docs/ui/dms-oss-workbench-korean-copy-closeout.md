# PACK-DMS-WB-07 Korean SaaS Copy Closeout

> Base: `origin/main@8dd29e6e1983b46ab367d9c5567bfb3f51b5f457`
>
> Branch: `feat/pack-dms-wb-07-korean-copy`
>
> TUWs: `DMS-WB-COPY-TUW-001~007`

## Result

The Korean SaaS copy audit is closed across the production web surfaces without
changing an API contract, database schema, permission rule, audit owner,
dependency, or external connection.

The implementation:

1. removes the information-barrier item from desktop and mobile navigation;
2. retains the protected `/walls` route, role guard, policy evaluation, audit
   behavior, and contextual security entry points;
3. replaces user-facing UUID, hash, account-reference, document-reference, and
   raw-enum entry or display with permission-scoped selectors, local hashing,
   Korean labels, or masked operational references;
4. normalizes the Korean product terms `Matter`, `Matter 코드`, `정보 차단`,
   `긴급 접근`, `문서`, and `검색 폴더`;
5. replaces specification and developer-facing prose with action, result, and
   recovery copy while retaining safe-denied semantics; and
6. extends the production literal and route-inventory guards so the audited
   regressions fail CI.

The recipient email field is normalized and SHA-256 hashed in the browser before
the existing external-user API payload is constructed. The raw email is not sent
to the server. Existing API reference fields and canonical enum values remain
unchanged.

## Rendered route evidence

The browser used only the repository's synthetic local firm-admin account and
the existing local API. The current local profile has no connected Matter source,
so Matter-dependent areas honestly rendered their approved connection-required,
empty, or unavailable states. No fake document or Matter data was introduced to
make the screenshots appear populated.

The following checks passed on every `/files` and `/search` viewport:

- zero page-level horizontal overflow;
- exactly one `main` landmark;
- zero duplicate IDs;
- zero visibly unnamed interactive controls in the workbench;
- zero raw UUID or 64-character SHA values in visible text;
- zero audited developer/specification phrases; and
- zero `/walls` navigation links.

The protected `/walls` route rendered successfully for the authorized synthetic
administrator at desktop and mobile widths. Its visible Korean page term is
`정보 차단`, while both the desktop navigation and the opened mobile navigation
omit the route.

An additional live route sweep covered `/admin/security`, `/audit`, `/work`,
`/notifications`, `/contracts`, `/integrations/matter-app`, `/matters`,
`/records`, and `/search/folders`. It found no audited developer phrase, raw
UUID, raw SHA, duplicate ID, page overflow, or `/walls` navigation link.

Screenshots remain ignored under `.artifacts/dms-wb-07/`; only this SHA-256 index
is committed.

| Route / state          | Viewport | Local-only artifact       | SHA-256                                                            |
| ---------------------- | -------: | ------------------------- | ------------------------------------------------------------------ |
| `/files`               | 1440x900 | `files-1440x900.png`      | `bbdb67fa7920db0c89f525049bbe92f6c8b6e1b95b25a34cb8e116fcc8251b04` |
| `/search`              | 1440x900 | `search-1440x900.png`     | `3e02226e883a0919a00fcd3a3931f461e55bc4527eacf9aff8b8391ef0283fa7` |
| `/files`               | 1024x768 | `files-1024x768.png`      | `a2a049525d46a2b5023de051558e7c34c9e2df7d9be9a8cc8cde81a487f1e0ce` |
| `/search`              | 1024x768 | `search-1024x768.png`     | `61d699a72dfcf9250bbb5e0bcac62b45927a2d4aa6cd6bbcfd74df6632853dd6` |
| `/files`               |  768x900 | `files-768x900.png`       | `dbbc31873e6ba9b362c7e5b251821da70307fd460cc39c6c1e7a86334df037dc` |
| `/search`              |  768x900 | `search-768x900.png`      | `c6fa81b8ba9fa424359f50b1bd45cb51137f62b9f21feb109b9fb51edbf00bcc` |
| `/files`               |  390x844 | `files-390x844.png`       | `4c82770266d379304ed2ca7183d5cbfd1a4a8878d22d4e5e3468de4fe2d005f4` |
| `/search`              |  390x844 | `search-390x844.png`      | `69630a1e4a2e71581b88794e2ee59bd52bcd45770cdddb2b2eb24d8ecc01916a` |
| mobile navigation open |  390x844 | `mobile-menu-390x844.png` | `a0afea35ef0104affffc9039f84d7e249539561a867ac8065a15540a1155c948` |
| `/walls` direct route  | 1440x900 | `walls-1440x900.png`      | `30311bd50feff9c30ab6e1134c6de2f49260cc36621fd9d9f800344b77fe3bc5` |
| `/walls` direct route  |  390x844 | `walls-390x844.png`       | `6e3da0b96c589b0690e924a653872aec502d0965322817c1dedc1308cdcec263` |

## Verification

Node 22.22.3 and pnpm 9.15.9 were used.

- root lint, typecheck, test, and production build pass;
- web tests pass at 122 files and 393 tests;
- production UI literal, production smoke, and UI PR checklist guards pass;
- frozen package remains 51 files and both canonical backlogs validate at
  174 and 266 TUWs;
- `git diff --check` passes and `docs/package/**` has no change; and
- changed-file AI-slop lint has no strong, default, or no-verify finding.

The 16 weak AI-slop heuristics are state-bound loading indicators and inherited
identifier heuristics in touched files. Rendered inspection confirmed that they
are not decorative motion or backgrounds, fake metrics, capability slogans, or
generated-image treatments.

No migration applies to this PACK. No external system, credential, customer
data, deployment, release, rollout, or go-live action occurred.
