# 11. Risk-based, Verification-driven, Loop-based Vault Development Operating System

## 1. 정의

Vault 개발 운영체계는 제품 목표를 Product North Star와 Product Constitution으로 고정하고, 제품 구조를 PBS로 분해한 다음, DBS와 Execution Dependency Graph로 변환하며, 각 실행 node를 Testable Unit of Work로 정의하고, Agent Work Contract를 통해 모델 또는 개발자에게 배정한 뒤, Risk-based Model Routing에 따라 구현·검증·리뷰·통합·배포·학습 루프를 운영하는 체계입니다.

## 2. 핵심 용어

| 기존 표현 | 권장 표현 |
|---|---|
| Atomic Work Item | Testable Unit of Work |
| WBS 단일구조 | PBS + DBS + WBS |
| Task Graph | Execution Dependency Graph |
| Handoff Packet | Agent Work Contract |
| Acceptance Criteria | Verification Contract |
| Test Case | Verification Case |
| Definition of Ready/Done | Readiness Gate / Completion Gate |
| Planner–Executor | Planner–Executor–Verifier–Governor |
| High/Low model | Risk-based Model Routing |

## 3. 역할

| 역할 | 기능 |
|---|---|
| Planner | 제품·도메인·작업 분해 |
| Executor | TUW 구현 |
| Verifier | 테스트·검증·리뷰 수행 |
| Governor | 위험 판단, 중단, 승인, 에스컬레이션, release gate |

## 4. Loop

| Loop | 사용 위치 |
|---|---|
| Exploration Loop | 제품 방향, 아키텍처 후보, 기술후보 탐색 |
| Convergence Loop | 구현·검증·수정 반복 |
| Orchestrated Integration Loop | 여러 TUW/agent 산출물 통합 |
| Learning Loop | 운영 피드백을 상위 계획에 반영 |
| Governance Loop | 위험판단, 승인, 중단, 에스컬레이션 |

## 5. Gate

| Gate | 통과 기준 |
|---|---|
| Development Constitution Gate | 제품·데이터·보안·AI·검증 원칙 확정 |
| Product Direction Gate | North Star, core workflow, non-goals 확정 |
| Domain Model Gate | core object, state, permission model 확정 |
| Architecture Decision Gate | blueprint와 ADR 확정 |
| Readiness Gate | TUW의 입력·범위·검증·의존관계 명확 |
| Completion Gate | Verification Contract 통과 |
| Review Gate | specialist review 통과 |
| Integration Gate | 통합검증 통과 |
| Release Gate | 위험도별 배포승인 |
| Learning Gate | ledger 반영 |

## 6. Model Routing

| Risk | 예시 | 배정 |
|---|---|---|
| Low | UI badge, mock data, 문서화 | 저비용/로컬 모델 가능 |
| Medium | CRUD API, 일반 form, 기본 test | 저비용 모델 + 자동검증 |
| High | DB migration, 외부 API, parser | 코드 전문 모델 + 상위 리뷰 |
| Critical | auth, permission, ethical wall, tenant isolation, AI retrieval, VDR | 상위모델 + 보안리뷰 + 사람 Gate |

## 7. Ledger

Decision Ledger는 아키텍처·제품·보안·AI 정책 결정을 기록합니다. Execution Ledger는 각 TUW 실행과 검증 결과를 기록합니다. Learning Ledger는 반복 실패와 해결 패턴을 기록합니다.
