# 소규모 로펌 월간 접근 검토 Runbook

## 목적과 범위

이 절차는 최대 20명인 단일 로펌 테넌트의 계정 접근 상태를 매월 한 번 읽기 전용으로
검토한다. 산출물은 담당자·문서·경로·토큰·비밀번호·원시 UUID를 포함하지 않는
해시 결합 JSON이다. 이 절차는 권한을 변경하지 않고, 이메일·티켓·SIEM 전송이나
외부 승인을 만들지 않는다.

- 실행 주기: 매월 첫 영업일에 직전 달을 대상으로 실행한다.
- 실행자: 해당 테넌트의 지정된 운영 담당자. 산출물의 실제 조치와 재검증은
  `firm_admin` 또는 `security_admin`이 앱 안에서 수행한다.
- 고정 stale 정책: 활성 계정이 마지막 로그인 기록이 없거나, 검토 월 마지막 날에서
  90일보다 이전에 로그인했다면 `STALE_ACTIVE_ACCOUNT`다.
- 검토 범위: 사용자 상태·역할·MFA 활성 secret 존재 여부·Matter 구성원 수·마지막
  로그인·유효 세션 수·유효 preview 세션 수·미완료 업로드 권한 수만 읽는다.

이 도구는 `BEGIN READ ONLY` 안에서 `app.current_tenant_id`를 먼저 설정한다. 따라서
테넌트 컨텍스트가 없는 교차 테넌트 조회나 운영 DB 변경 경로는 없다.

## 사전 준비

다음 두 파일은 절대 경로로 준비하고, 소유자 읽기 전용(`0600`)으로 둔다.

- `database-runtime-url`: 운영 런타임 role의 PostgreSQL URL 한 줄만 둔다.
- `tenant-id`: 검토할 테넌트 UUID 한 줄만 둔다.

URL이나 tenant UUID를 명령줄·셸 히스토리·로그·검토 JSON에 넣지 않는다. 출력 파일은
존재하면 도구가 실패하며, 기존 증적을 덮어쓰지 않는다.

## 실행

아래에서 경로는 실제 절대 경로로 바꾼다. URL과 tenant scope는 파일로만 전달된다.

```bash
pnpm release:small-firm-access-review -- \
  --database-url-file /absolute/private/database-runtime-url \
  --tenant-id-file /absolute/private/tenant-id \
  --review-month 2026-07 \
  --output /absolute/evidence/access-review-2026-07.json
```

`--review-month`는 `YYYY-MM` 형식의 비밀이 아닌 검토 기준값이다. 명령의 종료 코드는
다음처럼 해석한다.

| 종료 코드 | 표준 출력 상태    | 의미                                                                                                            |
| --------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `0`       | `PASS`            | 닫힌 정책 finding이 없다. 산출물을 검토 증적으로 보관한다.                                                      |
| `1`       | `REVIEW_REQUIRED` | 검토할 finding이 있다. 산출물은 정상 생성되며, 앱에서 조치 후 새 파일명으로 재실행한다.                         |
| `1`       | `FAILED`          | 입력 파일·권한·스키마·DB 읽기 또는 출력 경로가 안전 조건을 만족하지 못했다. 조치하지 말고 오류 코드를 조사한다. |

산출물 해시는 오프라인에서 다음 명령으로 재검증할 수 있다.

```bash
pnpm release:small-firm-access-review -- \
  --verify-manifest /absolute/evidence/access-review-2026-07.json
```

`VERIFIED`는 JSON payload와 `payloadSha256`의 일치만 뜻한다. 운영 승인·배포·릴리스·
go-live를 뜻하지 않는다.

## 산출물과 finding 해석

산출물의 닫힌 스키마는 다음 필드만 사용한다.

```text
schemaVersion, reviewMonth, tenantScopeHash, accountCount, accounts,
findings, payloadSha256
```

각 account에는 해시된 `accountRef`, 역할·상태·MFA 상태·집계 수·마지막 로그인 시각과
`offboardingState`만 있다. `accountRef`는 역산하거나 DB/셸에서 검색하는 키가 아니다.

| finding                                   | 앱 안에서 확인할 항목                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `ADMIN_MFA_MISSING`                       | 관리자 계정의 MFA 등록·활성화를 완료한다.                                     |
| `MFA_STATE_INCONSISTENT`                  | MFA 표시와 활성 secret 상태의 불일치를 보안 관리자가 조사한다.                |
| `STALE_ACTIVE_ACCOUNT`                    | 활성 계정의 계속 필요성을 확인하고, 불필요하면 앱의 비활성화 절차를 사용한다. |
| `INACTIVE_ACCOUNT_ACTIVE_SESSION`         | 비활성/잠김 계정에 남은 세션이 있는지 확인한다.                               |
| `INACTIVE_ACCOUNT_ACTIVE_PREVIEW_SESSION` | 비활성/잠김 계정에 남은 preview 접근이 있는지 확인한다.                       |
| `INACTIVE_ACCOUNT_OPEN_UPLOAD_AUTHORITY`  | 비활성/잠김 계정에 미완료 업로드 권한이 남아 있는지 확인한다.                 |
| `ORPHAN_MATTER_MEMBERSHIP`                | 사용자 없는 Matter 구성원 매핑 무결성 이상을 조사한다.                        |

## 해시 계정 참조를 앱에서 해소하는 방법

`accountRef`는 의도적으로 개인정보나 UUID를 드러내지 않는다. 따라서 산출물에서 이를
역산하거나, 원시 계정 목록을 export하여 매칭하지 않는다.

1. `firm_admin` 또는 `security_admin`으로 앱의 **관리 > 보안 > 사용자 접근** 화면을 연다.
2. 같은 검토 월의 산출물에서 해당 `accountRef` 행의 역할, 상태, MFA 상태, 마지막 로그인,
   Matter 구성원 수와 세션/preview/업로드 집계를 확인한다.
3. 앱의 라이브 사용자 행에서 역할·상태·MFA·최근 로그인으로 해당 계정을 식별하고, 필요한
   MFA 등록 또는 비활성화/재활성화 조치를 앱 안에서 수행한다. 20명 상한은 이 대조가
   수동 검토 가능한 크기이도록 한 경계다.
4. 이 속성만으로 한 계정을 유일하게 식별할 수 없으면 추측하지 않는다. 지정된 관리자가
   앱의 현재 사용자 접근 화면에서 직접 확인할 때까지 보류하고, 원시 DB/디렉터리 export로
   우회하지 않는다.
5. 조치 뒤에는 새 출력 파일 경로로 같은 월 검토를 다시 실행하고, 새 `payloadSha256`와
   종료 상태를 보관한다.

## 증적 보관과 금지 경계

월별 증적에는 다음만 보관한다: 실행 월, `tenantScopeHash`, account 수, finding 코드,
`payloadSha256`, 검증 결과, 조치 전·후 산출물 경로와 재실행 시각. 산출물 자체는
owner-only 파일 권한을 유지한다.

다음은 이 절차의 범위 밖이며 자동으로 수행하지 않는다.

- 이메일, 외부 티켓, SIEM 또는 외부 승인 생성
- 계정·Matter·문서·audit event의 자동 변경
- 원시 사용자 ID, 연락처, 문서명, 파일 경로, URL, 토큰, 비밀번호 또는 secret의 보관
- 배포, 릴리스 또는 go-live 승인 주장

도구가 `FAILED`를 반환하거나 계정 식별이 불명확하면, 해당 월 검토는 미완료로 남긴다.
새 시스템·외부 연동을 추가하지 말고 앱의 권한 있는 관리자와 함께 원인을 해소한 뒤 처음부터
다시 실행한다.
