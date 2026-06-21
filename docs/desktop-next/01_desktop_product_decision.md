# 01. Desktop Product Decision — AMIC Vault Desktop Next

검토일: 2026-06-21  
의사결정 수준: 실행계획 권고. 기존 `ADR-014: Desktop Client Strategy`를 전제로 하되, native desktop 착수 전 human/security review로 확정해야 한다.

## 1. Executive decision

AMIC Vault의 현재 권장 방향은 PWA-first를 유지하고, 고객 IT 또는 파일럿 배포에서 signed installer·managed distribution이 실제로 필요할 때 `apps/desktop`에 Tauri v2 thin shell을 별도 구현하는 것이다. Electron 또는 fully native client는 기본 선택지가 아니다.

최종 권고는 다음과 같다.

1. 현재 상태는 PWA/installable web app으로 부르고 운영한다.
2. “네이티브 데스크톱 앱”이라는 표현은 `apps/desktop` Tauri v2 thin shell scaffold, origin guard, capability deny-by-default, signing/update policy, no-local-storage tests가 완료된 뒤에만 사용한다.
3. desktop layer는 서버를 대체하지 않는다. 승인된 Vault web origin을 안전하게 감싸고, app identity·window shell·installer·signed update·release channel만 담당한다.
4. 데스크톱화는 release/production lane과 분리된 branch/worktree에서 진행한다. native shell PR은 production deploy PR과 합치지 않는다.

## 2. 선택지 비교

| 선택지 | 장점 | 단점 | AMIC Vault 적합성 | 결론 |
|---|---|---|---|---|
| PWA-only | 기존 `apps/web` 재사용, attack surface 최저, 브라우저 보안 모델 활용, 서버 권한·감사 유지가 가장 자연스러움, 빠른 pilot 가능 | customer IT가 signed installer·managed update를 요구하면 부족, OS integration 제한, 설치/업데이트 UX가 browser/OS에 종속 | 현재 구현 상태와 가장 일치. 이미 manifest, service worker, offline shell, cache/no-store tests, smoke/UAT evidence가 존재 | 현행 기본값. pilot에는 우선 적용 |
| Tauri v2 thin shell | signed macOS/Windows installer 가능, web UI 재사용, Electron보다 runtime footprint와 JS/Node attack surface가 작음, capability-based native API deny-by-default 가능, origin guard 구현 가능 | Rust/Tauri packaging·signing·notarization·updater QA 필요, webview/session 차이 검증 필요, remote origin policy를 엄격히 설계해야 함 | 고객 IT 포장 요구와 서버-authoritative Vault 모델을 동시에 만족하기에 가장 적합 | 필요 시 1차 native path로 채택 |
| Electron | mature packaging ecosystem, 넓은 OS integration, web UI 재사용 가능 | Chromium+Node surface가 큼, preload/IPC/context isolation/sandbox 관리 부담, dependency patching 부담, 문서 vault에 비해 방어 비용이 큼 | 구체적 OS integration이 Tauri로 불가능한 경우가 아니면 과도함 | fallback. 기본값 금지 |
| Fully native 또는 Flutter | native UX 통제, enterprise installer 가능 | Next.js UI를 사실상 재구현, 권한·감사·검색·AI QA가 이중화, 제품 속도 저하, local data authority 유혹 증가 | 법률문서 vault의 권한·감사·검색 보안 경계를 중복 구현하게 되어 부적합 | 현 단계 부적합 |

## 3. 왜 Tauri thin shell이 적합한가

Tauri thin shell은 “서버가 권위 있고 desktop은 접근 표면일 뿐”이라는 AMIC Vault의 구조와 가장 잘 맞는다.

- `apps/web`를 UI source of truth로 유지한다. desktop 전용 UI codebase를 만들지 않는다.
- `apps/api`의 authentication, PermissionService, AuditService, tenant context, document lifecycle, search, AI policy, records control을 그대로 사용한다.
- local database, local full-text index, local vector store, local AI context store를 만들 이유가 없다.
- Tauri capability model을 이용해 filesystem, clipboard, dialog, shell open, native share, HTTP bypass, updater 등 native capability를 deny-by-default로 둘 수 있다.
- signed installer, notarization, release channel, updater policy, customer IT handoff pack을 제공할 수 있다.
- Electron 대비 Node integration 및 preload/IPC 설계 부담이 낮다. 단, Tauri도 remote webview, custom protocol, updater, deep link 처리는 별도 threat model과 tests가 필요하다.

## 4. 왜 Electron을 기본값으로 두면 안 되는가

Electron은 “문서·사건 vault를 안전하게 감싸는 thin client”에는 기본 선택지로 과하다.

- Chromium, Node, preload, IPC, native module dependency가 결합되어 attack surface가 커진다.
- context isolation, sandbox, preload API allow-list, navigation guard, certificate pinning, auto-update 서명 검증을 모두 별도 설계해야 한다.
- 개발팀이 native IPC를 통해 서버의 PermissionService/AuditService를 우회하는 편의 기능을 만들 가능성이 커진다.
- 문서 미리보기·다운로드·검색·AI context를 local로 복제하려는 요구가 생기면 Constitution 위반 위험이 증가한다.
- Tauri로 가능한 installer-grade shell을 Electron으로 먼저 구현할 보안상 이유가 현재 없다.

Electron 검토가 허용되는 경우는 제한적이다. 예컨대 특정 고객 계약이 Tauri로 구현 불가능한 OS-level DMS/scanner/file-association integration을 요구하고, 별도 ADR, threat model delta, PermissionService negative tests, AuditService preservation tests, rollback plan, human security approval이 모두 완료된 경우에 한한다.

## 5. 왜 fully native를 기본값으로 두면 안 되는가

Fully native 또는 Flutter client는 다음 이유로 현재 단계에 맞지 않는다.

- Next.js UI의 제품 동작과 permission/audit UX를 별도로 재구현해야 한다.
- 서버 권한 경계를 재검증해야 할 endpoint와 UX surface가 이중화된다.
- 검색/AI/문서 미리보기/다운로드의 subtle leakage test matrix가 폭증한다.
- native offline UX 요구가 자연스럽게 발생하여 “no local document/search/AI/audit storage” 원칙을 약화시킬 수 있다.
- enterprise pilot의 핵심 요구인 signed installer만으로는 fully native의 비용과 리스크가 정당화되지 않는다.

## 6. AMIC Vault desktop product definition

AMIC Vault Desktop의 product definition은 다음과 같이 제한한다.

| 범주 | 포함 | 제외 |
|---|---|---|
| 접근 표면 | 승인된 Vault web origin launch, window shell, app identity, login redirect handling | local auth authority, token exchange, offline identity provider |
| 배포 | signed installer, notarization, channel policy, signed updater, digest pinning | private endpoint, secret, AWS account id, token, cookie를 repo 또는 package에 포함 |
| 보안 | origin allow-list, navigation block, capability deny-by-default, log allow-list | local document cache, local search index, local AI context, audit row storage |
| UX | browser/PWA와 동일한 server-gated app experience | native share sheet, mail compose, secure link, external user handoff, unapproved OS integrations |
| 운영 | rollback to browser/PWA, customer IT handoff pack | desktop artifact가 server production release gate를 자동 통과시키는 행위 |

## 7. Constitution mapping

| Constitution | Desktop decision |
|---|---|
| Permission-before-search | Desktop은 local searchable corpus를 만들지 않는다. Search는 서버 endpoint에서 PermissionService filter 주입 후 수행한다. |
| Permission-before-AI | Desktop은 AI context를 local로 저장하거나 AI 모델에 직접 전달하지 않는다. AI는 서버 gate를 통과한 context만 사용한다. |
| Audit-by-default | view/download/native-open은 기존 server API를 경유하며 AuditService event가 선행 또는 동일 transaction semantics로 보장된다. |
| Fail-closed | origin config, update signature, capability config, session state가 불명확하면 차단한다. |
| Immutable original | Desktop은 원본 file object를 직접 쓰거나 교체하지 않는다. |
| No silent external sharing | share sheet, mail compose, external link, public link, external portal shortcut은 별도 release/permission gate 전 금지한다. |
| Sensitive data is not logged | local logs는 app version, release channel, approved origin evidence ref, OS family, correlation/request ref로 제한한다. |

## 8. Recommended product path

1. PWA security audit를 먼저 재실행한다. 현재 PWA 구현이 desktop release baseline이다.
2. Tauri thin shell은 `apps/desktop`을 새로 생성하는 독립 branch/worktree에서 진행한다.
3. 최초 Tauri PR은 foundation만 수행한다. 서버 기능, API endpoint, document/search/AI/audit behavior는 변경하지 않는다.
4. Tauri shell은 approved origin allow-list와 navigation guard 없이는 merge하지 않는다.
5. native capability는 deny-by-default가 증명되기 전까지 모두 닫는다.
6. signing, notarization, updater, release channel은 문서와 test evidence가 먼저 준비되어야 한다.
7. production rollout은 browser/PWA fallback이 준비된 pilot channel 이후에만 진행한다.
