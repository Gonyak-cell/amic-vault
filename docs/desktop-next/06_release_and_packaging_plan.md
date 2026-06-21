# 06. Release and Packaging Plan — AMIC Vault Desktop Next

검토일: 2026-06-21  
목표: Tauri thin shell이 필요한 경우 macOS/Windows 배포, signing, updater, release channel, digest pinning, rollback, customer IT handoff를 서버 production lane과 분리해 운영한다.

## 1. Release posture

Desktop artifact release is not server production release. Desktop artifact는 승인된 Vault web origin을 여는 access surface일 뿐이고, API/web/worker/database/storage production promotion을 자동으로 유발해서는 안 된다.

기본 posture:

- PWA/browser path는 항상 fallback으로 유지한다.
- Tauri desktop release는 pilot channel에서 먼저 검증한다.
- production desktop rollout은 signed artifact, approved origin ref, updater policy, rollback rehearsal, human/security approval이 모두 갖춰진 뒤에만 허용한다.
- 모든 evidence는 reference-only여야 한다. private endpoint, account id, ARN, token, cookie, customer data, screenshots with private URL은 repo에 넣지 않는다.

## 2. macOS notarization plan

| Step | Required decision/control | Evidence |
|---|---|---|
| Developer account owner | Apple Developer Program owner and signing operator role 지정 | owner role/ref only |
| Certificate custody | Developer ID Application certificate private key custody outside repo | custody approval ref |
| Hardened runtime | Tauri bundle hardened runtime enabled with minimal entitlements | build config review |
| Entitlements | no broad filesystem, camera, microphone, address book, automation entitlements unless separate ADR | entitlement diff |
| Notarization | Apple notarization submission outside repo or via CI secret store | notarization success ref, no credentials |
| Stapling | notarization ticket stapled to DMG/PKG/app where applicable | staple verification ref |
| Gatekeeper smoke | clean macOS VM opens signed app and loads approved origin | smoke ref with no private URL |
| Rollback | withdraw bad artifact from channel and route users to browser/PWA | rollback ref |

Minimum macOS outputs:

- signed `.app` or DMG/PKG as chosen by customer IT;
- SHA-256 digest;
- signer identity summary without private identifiers beyond approved public certificate identity;
- notarization status ref;
- release channel and approved origin evidence ref;
- rollback instruction.

## 3. Windows signing and installer plan

| Option | Use when | Security requirements | Notes |
|---|---|---|---|
| MSIX | customer IT supports MSIX/App Installer and managed deployment | code signing certificate, package identity, update channel policy | clean enterprise lifecycle, but customer packaging constraints must be checked |
| Signed installer | customer IT requires traditional installer | signed executable/MSI, digest, uninstall/rollback procedure | ensure installer does not write sensitive logs/config |
| Portable artifact | developer/local testing only | not customer distribution; clearly marked non-production | no production channel |

Windows requirements:

- Code signing certificate private key must remain outside repo.
- Installer must not include private endpoint, token, cookie, AWS account id, customer data.
- SmartScreen/reputation expectations should be explained to customer IT; signing alone may not eliminate first-run warnings.
- Per-user vs per-machine install must be decided by customer IT. Default should minimize privileges.
- Auto-update must be disabled until signed update/channel policy is approved.

## 4. Release channels

| Channel | Origin policy | Artifact signing | Updater | Data scope | Promotion rule |
|---|---|---|---|---|---|
| local | `localhost` only | unsigned/debug acceptable | disabled | developer synthetic only | never customer packaged |
| staging | approved staging evidence ref | signed preferred; debug allowed only for internal testing | disabled unless signed staging update test exists | synthetic/pilot-approved only | requires SMOKE-012~015 and desktop native tests |
| pilot | approved pilot origin ref | signed required | signed updater optional but channel-bound | approved pilot data only | requires customer IT acceptance and rollback rehearsal |
| production | approved production custom domain ref | signed and notarized/signing verified | signed updater with wrong-channel rejection | production customer access | requires human/security/Ops approval and browser/PWA fallback |

## 5. Digest pinning

Every desktop artifact must record:

- artifact file name;
- version;
- commit SHA or release ref;
- channel;
- approved origin evidence ref;
- SHA-256 digest;
- signing status;
- notarization status for macOS;
- update manifest digest and signature where updater is enabled;
- release approval ref;
- rollback target ref.

Digest pinning rules:

- Release notes may include digest and evidence refs, not private endpoint values.
- CI should fail if digest is missing for a customer-facing artifact.
- Customer IT handoff must allow independent digest verification.
- If artifact is rebuilt, it receives a new digest and cannot silently replace the prior artifact under the same evidence row without explicit supersession notation.

## 6. Signed updater policy

Updater must remain disabled until all items below are satisfied.

- Update manifest is signed.
- Artifact digest is verified.
- Release channel is embedded or otherwise validated.
- Wrong-channel update is rejected.
- Unsigned update is rejected.
- Rollback artifact is explicitly approved for rollback channel.
- Update endpoint is referenced by approved ref only; raw private URL is not committed.
- User-visible failure does not expose private endpoint or token.
- Security reviewer approves update test evidence.

## 7. Rollback to browser/PWA

Rollback must be possible at every stage.

| Incident | Immediate action | Verification |
|---|---|---|
| Tauri origin guard regression | disable desktop artifact/channel; direct users to browser/PWA URL | unapproved origin test fixed before republish |
| Native capability regression | withdraw artifact; disable updater; browser/PWA fallback | capability deny tests green |
| Local cache/storage leakage | withdraw artifact; instruct app removal or appdata cleanup where approved; browser/PWA fallback | marker scan 0 hits in fixed build |
| Service worker PWA leakage | execute existing Desktop/PWA rollback runbook: disable registration, deploy unregister worker, delete shell caches | SMOKE-012~015 green or approved disabled state |
| Signing/update compromise | revoke affected channel/artifact; rotate signing/update material outside repo; publish security advisory through approved channel | signature/digest validation restored |
| Server permission/audit regression | stop desktop rollout and server rollout; use server rollback/forward-fix path | Permission/Audit gates green |

Rollback communications must avoid customer data, private endpoints, tokens, cookies, screenshots with private URLs, or document names/snippets.

## 8. Customer IT handoff pack

The handoff pack should contain:

- product name and version;
- supported OS versions;
- installer type and per-user/per-machine behavior;
- signer identity summary;
- SHA-256 digest;
- notarization status for macOS;
- release channel;
- approved origin reference or approved public domain, not private endpoint;
- network allow-list requirements at domain level only, if approved;
- update policy and whether auto-update is enabled;
- data handling statement: no local document/search/AI/audit cache;
- log allow-list and log location, if any;
- rollback/uninstall instructions;
- browser/PWA fallback instructions;
- support escalation contacts by role;
- known limitations: no offline document access, no local AI, no native share/mail, no external sharing outside server-approved release gates.

## 9. CI and release gate separation

Desktop CI may build and test desktop artifacts, but must not deploy server production.

Minimum desktop CI lanes:

- lint/typecheck/test for `apps/desktop`;
- Rust/Tauri tests;
- origin guard negative tests;
- capability deny tests;
- no local storage marker scan;
- updater negative tests when updater exists;
- PWA baseline tests;
- `pnpm docs:frozen`;
- artifact digest generation;
- signing/notarization verification for release channels.

Production release gate must require explicit human/security approval for:

- channel promotion;
- origin ref approval;
- signing/notarization evidence;
- updater policy evidence;
- rollback readiness;
- customer IT handoff completion.

## 10. Packaging stop conditions

Packaging must stop if:

- certificate private key, signing secret, notarization credential, token, cookie, private endpoint, AWS account id, or customer data would be committed;
- production custom domain/ref is not approved but broad production rollout is requested;
- updater cannot reject unsigned or wrong-channel artifacts;
- desktop artifact can access unapproved origin;
- native capability opens without ADR;
- local document/search/AI/audit persistence is detected;
- server PermissionService/AuditService is bypassed;
- rollback to browser/PWA is not available.
