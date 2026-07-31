# Manual QA — exact source browser receipt

- Source SHA: `269877204c75a43c47f193fdb96fa52e1ad6a0b0`
- Surface: Chrome standalone `http://localhost:3100` + API `http://localhost:3101`
- Matrix: 50 route/viewport combinations; `720x450` is a 200%-equivalent CSS
  reflow viewport, not native zoom.

## surfaceEvidence

| scenarioId               | criterion                   | surface                    | exact invocation                                                                      | verdict          | artifactRefs                   |
| ------------------------ | --------------------------- | -------------------------- | ------------------------------------------------------------------------------------- | ---------------- | ------------------------------ |
| matter-history           | Matter A/B history          | /matters/:matterId         | goto A, goto B, Back, Forward                                                         | PASS             | interactions JSON              |
| files-drawer             | Files drawer focus/Escape   | /files at 390x844          | click 탐색, Tab, Escape                                                               | PASS             | interactions JSON, screenshots |
| clients-rapid-search     | Client request generation   | /clients                   | submit 서림 then immediately 한빛                                                     | PASS             | interactions JSON, matrix JSON |
| work-persistence-restore | Work assignment persistence | /work                      | owner to member, member reload, member to owner, owner reload                         | PASS             | interactions JSON              |
| login-history            | protected deep-link history | /matters/:matterId, /login | logout, protected goto, login, Back                                                   | PASS             | interactions JSON              |
| admin-guard-member       | ordinary-user admin guard   | /admin                     | member login then goto /admin                                                         | PASS             | interactions JSON              |
| admin-guard-firm-admin   | firm-admin access           | /admin                     | firm-admin login then goto /admin                                                     | PASS             | interactions JSON              |
| route-matrix             | responsive route matrix     | 10 routes x 5 viewports    | direct goto each route, settle, horizontal overflow/interactive/copy/error assertions | PASS             | browser JSON, screenshots      |
| console                  | runtime console             | all scenarios              | final tab console log collection                                                      | PASS (0 entries) | console JSON                   |

## adversarialCases

| scenarioId            | criterion     | adversarialClass            | expected behavior                                                   | verdict        | artifactRefs                                                                                         |
| --------------------- | ------------- | --------------------------- | ------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- |
| responsive-horizontal | responsive UI | horizontal clipping         | no horizontal overflow or visible interactive control outside width | PASS           | browser JSON                                                                                         |
| forbidden-copy        | UI cleanup    | helper/internal/error copy  | no target helper copy or raw role/error codes                       | PASS           | browser JSON                                                                                         |
| unexpected-redirect   | routing       | unexpected auth redirect    | authorized route stays on requested path                            | PASS           | browser JSON, interactions JSON                                                                      |
| console-errors        | runtime       | browser console error       | zero console entries after scenarios                                | PASS           | console JSON                                                                                         |
| g35-delayed-list      | G35           | delayed older list response | delayed stale list must not overwrite newly created row             | NOT_APPLICABLE | Browser capability snapshot; no request interception; exact-SHA component race test is authoritative |

## artifactRefs

- browser-matrix-26987720: `browser-matrix.json`
- interactions-26987720: `browser-interactions.json`
- console-26987720: `browser-console.json`
- screenshots: `dashboard-1440x900.png`, `clients-390x844.png`,
  `matter-390x844.png`, `work-1440x900.png`
