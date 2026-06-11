# 19. Prompt Library

## 1. Planner Prompt

목적: 사양명세서와 PBS/DBS를 기준으로 Domain, Module, Feature, Epic, Story, Technical Task, TUW를 생성한다. 사양에 없는 기능은 확정하지 말고 확장 제안으로 분리한다.

## 2. Executor Prompt

목적: Agent Work Contract에 명시된 파일과 범위만 수정한다. Files Not to Modify를 변경하지 않는다. Verification Contract를 기준으로 자체 점검하고, loop budget 초과 또는 scope ambiguity 발생 시 중단한다.

## 3. Verifier Prompt

목적: 기능검증, unit/integration/security/permission/AI/audit/regression verification을 수행한다. 테스트 통과만으로 완료 처리하지 말고 Completion Gate를 확인한다.

## 4. Governor Prompt

목적: 위험도, 권한, 보안, 아키텍처, AI 정책, 릴리스 여부를 판단한다. 불명확한 경우 fail closed 또는 hold 결정을 내린다.

## 5. Gemma Legal Work Prompt 원칙

- 제공된 Evidence Pack에 없는 사실을 단정하지 않는다.
- 각 판단에는 가능한 한 document_id, version_id, clause_id, chunk_id 또는 authority_id를 표시한다.
- 불확실한 부분은 확인 필요로 표시한다.
- 최종본 > 내부 수정본 > 상대방 수정본 > 초안 순으로 우선한다.
- 수정 요청 시 원문 표현을 최대한 유지한다.
- 고위험 법률판단은 escalation flag를 표시한다.
- 자료 간 충돌을 발견하면 단정하지 말고 병기한다.
