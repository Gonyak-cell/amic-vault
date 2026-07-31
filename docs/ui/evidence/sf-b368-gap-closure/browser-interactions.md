# SF-B368 Gap Closure 브라우저 상호작용 영수증

- 검증 소스 SHA: `269877204c75a43c47f193fdb96fa52e1ad6a0b0`
- Web: production Next.js standalone, `localhost:3100`
- API: local exact-source API, `localhost:3101`
- 데이터: 격리된 로컬 seed/브라우저 fixture
- 검증일: 2026-07-31 KST

## 화면·반응형

10개 route를 `1440×900`, `1024×768`, `768×1024`, `390×844`, `720×450`에서
확인했다. 50개 조합 모두 다음 assertion이 0건이었다.

- page horizontal overflow
- 가로 방향으로 viewport 밖에 잘린 visible interactive control
- 삭제 대상 helper copy와 `권한으로 보호됨`
- raw 표준 error code
- 완료 뒤 남은 loading/error 문구
- 로그인 화면 등 예상 밖 redirect

원시 결과: [`browser-matrix.json`](./browser-matrix.json)

특히 G34의 원인이었던 `/clients` 390×844에서 고객 등록, 검색 input, 검색 버튼이 모두
카드와 viewport 안에 보였고 검색 버튼의 오른쪽 경계는 359px였다. 720×450과
1440×900에서도 각각 카드 안 배치와 desktop 한 행 배치를 유지했다.

`720×450`은 `1440×900` 화면의 **200% 등가 CSS viewport reflow**다. 브라우저
native zoom을 사용하지 않았으며 그렇게 주장하지 않는다. 세로 page scroll은 정상
문서 흐름으로 허용하고, 가로 overflow와 잘린 hit target만 실패로 판정했다.

## 실제 상호작용

| 시나리오                                  | 관찰                                                                                                            | 판정 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---- |
| Matter A → Matter B → Back → Forward      | Back은 `공급계약 검토`, Forward는 `상표권 분쟁 대응`과 현재 URL을 복원                                          | PASS |
| Files 모바일 탐색 drawer                  | open 시 `문서 탐색 닫기`로 focus, Tab 뒤 dialog 내부 유지, Escape 뒤 dialog 제거 및 `탐색` trigger로 focus 복귀 | PASS |
| Client 빠른 연속 검색                     | `서림` 요청 직후 `한빛`을 제출해도 최종 목록은 한빛테크만 표시                                                  | PASS |
| 일반 사용자 Work 재배정                   | Matter Owner가 Alpha Member로 재배정, 별도 Member 로그인 세션과 reload에서 서버 값 유지                         | PASS |
| Work 원상복구                             | Member가 같은 Work 전용 후보 계약으로 Matter Owner에게 재배정; 직접 DB 수정 없이 audited API 사용               | PASS |
| 로그아웃 → 보호 deep link → 로그인 → Back | 허가된 `next`로 Matter 복귀, Back은 `/dashboard`; `/login` 재노출 없음                                          | PASS |
| 일반 사용자 `/admin`                      | URL을 성공 화면으로 속이지 않고 관리자 전용 안전 상태 표시; raw role/error code 없음                            | PASS |
| 관리자 `/admin`                           | 관리자 설정 성공 화면 표시; raw backend role 없음                                                               | PASS |

Work 검증에 사용한 항목은 검증 뒤 원래 담당자에게 복구했다. 재배정과 복구 모두 제품의
동일 transaction/audit 경로를 사용했다.

G35의 임의 응답 지연은 사용 가능한 브라우저 제어 표면에 request interception이 없어
브라우저에서 주입하지 않았다. 이를 PASS로 꾸미지 않고 machine-readable 결과에
`NOT_APPLICABLE`로 기록했다. 최종 SHA의 실제 `ClientsPage` effect·submit handler를
실행하는 deferred-response 회귀 테스트가 해당 경쟁 조건의 권위 증거다.

## 콘솔·화면 증거

- 전체 상호작용 종료 뒤 브라우저 console entry: 0
- 화면 로드와 mutation은 표시된 서버 데이터·URL·새 세션 결과로 확인
- 비밀번호, cookie, session token, 문서 본문은 artifact에 기록하지 않음
- 상호작용 원시 결과:
  [`browser-interactions.json`](./browser-interactions.json)
- console 원시 결과: [`browser-console.json`](./browser-console.json)

대표 화면:

- [`dashboard-1440x900.png`](./dashboard-1440x900.png)
- [`clients-390x844.png`](./clients-390x844.png)
- [`matter-390x844.png`](./matter-390x844.png)
- [`work-1440x900.png`](./work-1440x900.png)
