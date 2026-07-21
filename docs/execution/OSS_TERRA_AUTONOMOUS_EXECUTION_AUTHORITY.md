# OSS Terra 자율 순차 실행 권한

**상태:** Active — `USER-UMBRELLA-AUTONOMY-20260721`

**기준선:** `origin/main` @ `91ac55a59b538cb57ecacecea4e69c92dc7c4cfd`

**대상 계획:** [GPT-5.6 Terra용 111 TUW 실행계획](../architecture/enterprise-dms-oss-terra-tuw-execution-plan-main-2026-07-21.md)

## 1. 부여된 자율 범위

운영자 지시 “내 승인 필요 없게 해줘 뭘 이걸 매번 승인하게 해?”에 따라,
Terra 계획의 30개 proposed sub-PACK/111개 TUW는 **PACK 또는 TUW마다 별도 사람
승인을 요청하지 않고** 다음 순서로 처리한다.

1. 다음 dependency-ready proposed sub-PACK의 canonical ID 충돌, 기준선, 파일
   범위, dependency, 검증 명령을 재검증한다.
2. frozen `docs/package/**`를 변경하지 않고 live registry, canonical backlog,
   TUW detail contract에 그 sub-PACK을 등록한다.
3. 등록한 범위 안에서 TUW 하나씩 구현, focused/negative/audit 검증, exact-head
   evidence를 남긴다.
4. predecessor의 local technical evidence와 atomic commits가 갖춰지면 다음
   dependency-ready TUW/sub-PACK을 시작한다. 이 권한 아래에서는 이전
   sub-PACK의 merge 자체를 다음 구현의 선행조건으로 삼지 않는다.

`PACK-OSS00-01`은 이미 local technical verification을 마친 첫 canonical
sub-PACK이다. 이 권한은 그 뒤의 canonical 등록과 실행뿐 아니라, 아직 proposed인
후속 ID의 just-in-time canonical 등록에도 적용한다. Proposed 문서의 ID는 live
registry와 backlog에 성공적으로 등록되기 전까지 canonical이 아니다.

## 2. 계속 적용되는 안전 경계

이 권한은 반복적인 **사람 승인 대기만 제거**한다. 다음은 자동 승인하지 않는다.

- 새 runtime/build dependency의 추가 또는 버전 교체(해당 TUW가 명시하더라도
  변경 전 별도 operator authority가 필요하다).
- deployment, cloud/IdP/registry/SIEM/account 설정, secret 사용, external service
  mutation, customer data 접근, production/staging traffic 변경.
- push, PR 생성/수정, CI 실행, protected-branch merge, release 또는 go-live 주장.
- upstream source의 제품 tree vendoring/fork 또는 상용/외부 배포. 다만 계획된
  source lab의 read-only exact-SHA clone·build·test·map 작성은 product tree 밖에서
  수행할 수 있다.
- `docs/package/**` 변경, TUW의 `Files NOT-modify` 변경, constitutional
  permission/audit/ethical-wall 원칙 위반, R11 전 external sharing, 또는
  AGENTS.md의 release/dependency 금지 사항.

위 경계가 필요한 TUW는 그 사실을 `EXTERNAL_BLOCKED` 또는 `BLOCKED`로 evidence와
append-only ledger에 기록한다. 독립적인 후속 작업은 계속하되, hard dependency가
막히면 그 descendant는 건너뛰어 완료로 주장하지 않는다.

## 3. 계속되는 검증·검토 규칙

- 각 TUW의 AND verification, negative permission/security test, audit rollback
  test, exact-head manifest, `pnpm backlog:validate`, `pnpm docs:frozen`, and
  `git diff --check`는 생략하지 않는다.
- Risk=C 변경은 repository 규칙상 독립 검토가 **merge 전** 필요하다. 이 권한은
  local implementation과 verification을 막지 않지만, 검토·외부 PR/merge를 자동
  허가하지 않는다.
- 동일 실패가 세 번 반복되거나 safe evidence, source pin, license/adoption decision,
  또는 required file scope를 확정할 수 없으면 해당 TUW를 중단·기록한다.

## 4. 이력과 우선순위

이 문서는 `docs/execution/PACKS_R4_R14.md`의 post-R14 live extension과
`docs/ledger/execution.md`의 이력에 결합한다. `USER-APPROVAL-PACK-OSS00-01-
REGISTRATION-20260721`의 “next PACK is not authorized” 제한은 이 권한의 범위에서만
대체된다. 기존 package, constitution, deployment, dependency, external-operation
제한은 대체하지 않는다.
