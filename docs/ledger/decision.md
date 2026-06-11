# Decision Ledger — append-only

- 2026-06-11 OPEN-05 확정: GitHub private repo(Gonyak-cell/amic-vault) + 로컬 작업. 승인 1명 강제 미적용(1인 개발) — 대체 통제: docs/package/codex/85_Human_Operations_Playbook.md §2-A 셀프 리뷰 체크리스트.
- 2026-06-11 OPEN-06 확정: Codex 데스크톱 앱(로컬 Mac) 실행환경.
- ADR-001~012: docs/package/codex/01_Adopted_Decisions_ADR.md (전부 Accepted, 2026-06-11). docs/adr/ 개별 등재는 DEVOPS-DOCSPKG-TRANSFER-TUW-002에서 수행.
- 2026-06-11 운영 결정: PR 리뷰·머지·BLOCKED 응답·Gate 점검을 검토 AI(Claude)에 위임 — 운영자(비개발자)는 호출·전달만. 독립성: 작성자(Codex)≠검토자(Claude). 실데이터 투입 전 사람(보안) 검토 1회 별도 권장. 근거: docs/package/codex/85_Human_Operations_Playbook.md §2-A.
- 2026-06-11 PACK-R0-01: ADR-001~012 repo-local 파일을 docs/adr/에 등재. Status는 DEVOPS-DOCSPKG-TRANSFER-TUW-002에 따라 R0 Gate 승인 대기(Proposed)로 표기하고, 확정 결정 근거는 docs/package/codex/01_Adopted_Decisions_ADR.md를 유지.
- 2026-06-11 운영 결정 갱신: 사용자 지시에 따라 PACK 구현·검증·PR 이후 merge까지 Codex가 수행한다. Risk=C/리뷰 필요 PACK은 PR 라벨·본문·ledger에 위험과 검증 근거를 남기되, green 상태 확인 후 Codex가 merge한다.
- 2026-06-11 PACK-R0-02: migration tool은 node-pg-migrate SQL-file mode로 확정. Migration table은 schema_migrations, row-level table convention은 tenant_id NOT NULL + ENABLE/FORCE RLS + CREATE POLICY + RLS-EXEMPT 주석 예외로 고정.
- 2026-06-11 PACK-R0-03: workspace migration은 명세의 0002 후보 대신 0007_workspaces.sql로 append. 사유: PACK-R0-02가 0005/0006을 이미 main에 merge했으므로 check-order=true에서 뒤늦은 0002 추가는 기존 dev DB migration history를 깨뜨린다.
- 2026-06-12 운영 결정: R14 Scale & Learning technical completion goal 범위에서 사람 승인, Claude 리뷰, human Gate sign-off, human merge approval 요구사항은 운영자 지시에 따라 waived로 처리한다. 단, 기술 검증·보안 불변 원칙·release 순서·Gate 체크리스트·append-only ledger 기록은 생략하지 않는다. R0-G2의 R1 범위 `matters` SQL은 R0에서는 `workspaces` 동등 SQL evidence로 충족 처리하고, R1에서 `matters` 생성 후 Gate 회귀로 재검증한다. ADR-001~012 repo-local status는 본 결정으로 `Accepted` 처리한다.
