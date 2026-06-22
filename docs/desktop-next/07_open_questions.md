# 07. Open Questions — AMIC Vault Desktop Next

검토일: 2026-06-21  
목표: desktop native 착수 전 사람이 결정해야 하는 항목을 명확히 한다. 결정 전 default는 fail-closed, PWA/browser fallback, no local storage이다.

> Current-state note, 2026-06-22: `apps/desktop` Tauri foundation has landed.
> Treat questions about first native merge as historical gate inputs. Questions
> about signing, updater, production custom domain/origin refs, customer IT,
> SSO/IdP redirects, and native capability expansion remain relevant before
> customer-facing native distribution.

## 1. Product and customer requirements

| ID | Question | Owner | Default until answered | Blocks |
|---|---|---|---|---|
| OQ-001 | 고객이 signed installer를 실제로 요구하는가, 아니면 PWA/browser pilot로 충분한가? | Product / Customer lead | PWA-first 유지 | Tauri foundation priority |
| OQ-002 | 고객 IT가 요구하는 installer 형식은 무엇인가: macOS DMG/PKG, Windows MSIX, MSI, EXE installer, MDM 배포 중 무엇인가? | Customer IT / Ops | no customer installer | packaging plan |
| OQ-003 | production custom domain이 확정되었는가? broad customer rollout 전에 어떤 domain/ref를 사용할 것인가? | Ops / Product | production desktop rollout 금지 | production channel |
| OQ-004 | pilot channel에서 사용할 approved origin ref는 무엇인가? raw endpoint 없이 ref로 표현 가능한가? | Ops / Security | staging synthetic only | pilot packaging |
| OQ-005 | 고객은 offline access를 요구하는가? 요구한다면 어떤 자료, 기간, 암호화, wipe, audit model을 요구하는가? | Product / Legal / Security | offline document/search/AI/audit access 금지 | 별도 ADR 필요 |
| OQ-006 | native share sheet, mail compose, secure link, external user handoff 요구가 있는가? | Product / Legal / Security | 전부 금지 | 별도 release/permission gate 필요 |

## 2. Auth, SSO, and session behavior

| ID | Question | Owner | Default until answered | Blocks |
|---|---|---|---|---|
| OQ-101 | SSO/SAML session behavior가 desktop webview에서 요구되는가? IdP redirect origin allow-list는 어떻게 정의할 것인가? | Auth owner / Security | server-owned basic session only; arbitrary external navigation block | auth smoke, origin guard |
| OQ-102 | OS keychain token storage가 필요한가? 필요하다면 어떤 token, lifetime, revocation, device binding이 필요한가? | Security | no desktop credential/token storage | keychain feature |
| OQ-103 | logout 시 webview cookie/storage cleanup 요구 수준은 무엇인가? | Security / Product | server logout + no sensitive local data assumption | auth session tests |
| OQ-104 | MFA/TOTP 또는 future SSO가 installed PWA와 Tauri webview에서 동일하게 동작해야 하는 최소 smoke path는 무엇인가? | Auth owner / QA | browser/PWA baseline only | desktop auth UAT |

## 3. Update and signing infrastructure

| ID | Question | Owner | Default until answered | Blocks |
|---|---|---|---|---|
| OQ-201 | updater infrastructure를 무엇으로 선택할 것인가: Tauri updater, MDM-managed update, manual signed installer distribution 중 무엇인가? | Ops / Security | updater disabled | updater policy |
| OQ-202 | macOS Developer Account와 notarization owner는 누구인가? | Ops | no macOS customer artifact | macOS distribution |
| OQ-203 | Windows code signing certificate owner와 custody model은 무엇인가? | Ops / Security | no Windows customer artifact | Windows distribution |
| OQ-204 | signing은 CI에서 할 것인가, isolated signing workstation에서 할 것인가? | Security / Ops | manual/offline signing ref only | release automation |
| OQ-205 | release channels `local`, `staging`, `pilot`, `production`의 promotion approver는 누구인가? | Product / Security / Ops | no production channel | release gate |
| OQ-206 | artifact SBOM, vulnerability scan, dependency review 요구 수준은 무엇인가? | Security | dependency review required; SBOM optional until decided | enterprise handoff |

## 4. Desktop architecture and native capabilities

| ID | Question | Owner | Default until answered | Blocks |
|---|---|---|---|---|
| OQ-301 | Tauri v2 remote webview loading에 대한 CSP, certificate, mixed content, navigation event policy를 어느 수준으로 강제할 것인가? | Security / Desktop architect | approved origin only; HTTP local only | origin guard |
| OQ-302 | deep link handling이 필요한가? 필요한 경우 어떤 scheme/path가 server route와 audit에 연결되는가? | Product / Security | no deep links | deep link feature |
| OQ-303 | filesystem permission이 필요한가? 예: download folder save dialog, scanner import, folder watch. | Product / Security | filesystem capability closed | native capability opening |
| OQ-304 | clipboard/dialog/shell-open capability가 필요한가? | Product / Security | all closed | native capability opening |
| OQ-305 | desktop crash reporting 또는 telemetry를 사용할 것인가? 사용한다면 log allow-list와 redaction gate는 무엇인가? | Security / Ops | no sensitive telemetry; local minimal logs only | observability |

## 5. Server integration and invariant ownership

| ID | Question | Owner | Default until answered | Blocks |
|---|---|---|---|---|
| OQ-401 | desktop view/download audit preservation의 서버-side owner는 누구인가? | API/Audit owner | existing API tests remain source of truth | audit preserve PACK |
| OQ-402 | search/AI offline leakage를 어떤 synthetic marker set으로 검증할 것인가? | QA / Security | existing marker tests only | no-local-storage PACK |
| OQ-403 | PermissionService fail-closed 오류 주입을 desktop release gate에도 full로 포함할 것인가? | Security / API owner | include existing permission/audit integration suites before release | release gate |
| OQ-404 | desktop artifact가 server version과 호환되는 최소/최대 API version policy는 필요한가? | API owner / Release | desktop follows approved web origin; no API pinning yet | updater/release compatibility |
| OQ-405 | support/incident 시 desktop logs 수집 방식은 무엇인가? | Ops / Legal / Security | user-provided minimal logs only, no sensitive dumps | customer IT handoff |

## 6. Legal, compliance, and customer IT

| ID | Question | Owner | Default until answered | Blocks |
|---|---|---|---|---|
| OQ-501 | 로펌 고객 보안정책상 local app data directory 사용 제한이 있는가? | Customer IT / Security | no sensitive local app data | no-local-storage validation |
| OQ-502 | 고객이 MDM/Intune/Jamf 배포를 요구하는가? | Customer IT / Ops | manual signed pilot artifact only | packaging |
| OQ-503 | 고객 IT handoff에 필요한 문서 양식, hash 검증, signer 증명, rollback 연락망 기준은 무엇인가? | Customer IT / Ops | standard handoff pack | release gate |
| OQ-504 | production incident response에서 desktop artifact disable 권한자는 누구인가? | Ops / Security / Product | Security/Ops joint approval | rollback |
| OQ-505 | 고객 계약상 offline cache가 금지되는지, 또는 반대로 요구되는지 확인되었는가? | Legal / Product | no offline cache | product scope |

## 7. Decisions required before first native merge

다음 질문은 원래 `apps/desktop` Tauri foundation PR merge 전 최소한 답변 또는 명시적 defer가 필요했던 항목이다. 현재 checkout에서는 foundation이 구현되었으므로, 남은 production distribution 판단에는 OQ-003/OQ-004, OQ-101, OQ-201~206, OQ-301, OQ-303/OQ-304, OQ-401 계열을 다시 확인한다.

1. OQ-001: signed installer 필요성.
2. OQ-003/OQ-004: approved origin ref model.
3. OQ-101: SSO/SAML redirect 처리 기본 방침.
4. OQ-201: updater disabled 또는 updater policy 착수 여부.
5. OQ-202/OQ-203: signing owner 존재 여부.
6. OQ-301: origin guard 보안 수준.
7. OQ-303/OQ-304: native capabilities default-deny 확인.
8. OQ-401: audit preservation owner.

## 8. Default decisions if unresolved

- Use PWA/browser path only.
- Do not ship customer-facing native installer.
- Do not enable updater.
- Do not open native capabilities.
- Do not add offline document/search/AI/audit access.
- Do not add native external sharing, secure links, share sheet, mail compose, file association, folder watch, scanner import, local OCR, local AI.
- Do not store secrets, endpoints, account ids, tokens, cookies, or customer data in repo or evidence.
- Escalate unresolved customer/security requirements before implementation.
