# AMIC Vault SF20 operations runbook

이 문서는 최대 20명 규모 단일 노드 배포에서 한 명의 운영자가
Prometheus 알림을 해석하고, 첫 조치를 수행하고, 제한된 시간 안에
에스컬레이션하기 위한 기준이다. 알림은 관찰 정보일 뿐 권한, 감사,
원본 불변성, 배포 또는 go-live를 승인하지 않는다.

## 공통 운영 계약

- 목표 가용성은 최근 30분 요청 기준 99.5% 이상이다.
- API p95는 1,000ms 이하, 권한 선필터 검색 p95는 2,000ms 이하이다.
- 백업 RPO는 60분, 검증된 격리 복구 RTO는 240분이다.
- 알림 수신 즉시 `alertname`, 시작 시각, 현재 상태를 기록하고
  `first_action`을 먼저 수행한다. 원문 요청, 파일명, 경로, 사용자나
  사건 식별자, 토큰, 자격증명은 증적에 기록하지 않는다.
- 침묵은 조사 중 중복 통지만 제한한다. 실제 장애를 건강 상태로
  바꾸지 않으며, 아래 상한을 넘겨 연장하지 않는다.
- 진단은 내부 호스트에서
  `docker compose -f infra/production/compose.yml -f infra/production/compose.images.yml`
  명령으로 수행한다. 출력은 집계값과 bounded code만 보존한다.
- 기술 구현과 로컬 드릴은 staging 증적이 아니다. 승인된 staging
  알림 전달 증적은
  `EXTERNAL_BLOCKED_APPROVED_STAGING_ALERT_DRILL_RECEIPT_REQUIRED` 상태로
  별도 유지한다.

공식 설정 검증:

```bash
docker run --rm --entrypoint /bin/promtool \
  -v "$PWD/infra/monitoring:/etc/prometheus:ro" \
  docker.io/prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893 \
  check config /etc/prometheus/prometheus.yml
docker run --rm --entrypoint /bin/promtool \
  -v "$PWD/infra/monitoring:/etc/prometheus:ro" \
  docker.io/prom/prometheus:v3.13.1@sha256:3c42b892cf723fa54d2f262c37a0e1f80aa8c8ddb1da7b9b0df9455a35a7f893 \
  test rules /etc/prometheus/alerts.test.yml
docker run --rm --entrypoint /bin/amtool \
  -v "$PWD/infra/monitoring:/etc/alertmanager:ro" \
  docker.io/prom/alertmanager:v0.33.1@sha256:9e082985f56f4c8c9f724e18f2288c6708f472e56a5286b8863d080434ea065d \
  check-config /etc/alertmanager/alertmanager.yml
```

## Sf20AvailabilitySloBreach

- 감지 의미: 최근 30분 성공 요청 비율이 99.5% 미만으로 10분 지속됐다.
- 첫 조치: Confirm API health and recent 5xx rate
- 진단: API health, 5xx 집계, DB availability, storage failure를 함께 확인한다.
- 확인 및 침묵: 상태 확인 시각과 담당자를 기록한다. 침묵 상한: 30m
- 복구 조건: 가용성 비율이 99.5% 이상으로 회복되고 관련 critical 알림이 해소된다.
- 에스컬레이션: 15분 안에 원인을 격리하지 못하면 쓰기 중지 또는 롤백 판단을 요청한다.
- 증적: alertname, fire/ack/resolve 시각, 가용성 비율, 설정 hash만 기록한다.

## Sf20ApiLatencyHigh

- 감지 의미: 전체 API 요청 p95가 1,000ms를 초과해 10분 지속됐다.
- 첫 조치: Check database waits and queue age
- 진단: DB waiting 수, oldest queue age, API p95 집계만 확인한다.
- 확인 및 침묵: 단일 조사 창만 유지한다. 침묵 상한: 30m
- 복구 조건: API p95가 1,000ms 이하로 돌아오고 DB wait가 증가하지 않는다.
- 에스컬레이션: 15분 내 개선이 없으면 비필수 작업 중지나 이전 이미지 복귀를 검토한다.
- 증적: alertname, p95, DB wait, queue age, fire/resolve 시각만 기록한다.

## Sf20SearchLatencyHigh

- 감지 의미: PermissionService 범위가 적용된 검색 p95가 2,000ms를 초과했다.
- 첫 조치: Check permission-scoped search latency
- 진단: 검색 route p95와 DB wait를 확인하며 권한 필터를 우회해 재시험하지 않는다.
- 확인 및 침묵: 권한 범위를 유지한 조사만 인정한다. 침묵 상한: 30m
- 복구 조건: 권한 범위 검색 p95가 2,000ms 이하로 회복된다.
- 에스컬레이션: 반복되면 query plan 증적을 민감 식별자 없이 개발 담당자에게 전달한다.
- 증적: alertname, bounded route class, p95, fire/resolve 시각만 기록한다.

## Sf20AuditWriteFailure

- 감지 의미: 중앙 audit insert가 한 번 이상 실패했다.
- 첫 조치: Stop affected writes and verify audit database health
- 진단: DB availability와 audit failure 집계만 확인하고 실패 행위를 성공으로 재분류하지 않는다.
- 확인 및 침묵: audit 없는 행위 재개는 금지한다. 침묵 상한: 15m
- 복구 조건: 테스트 audit가 같은 트랜잭션에서 성공하고 failure 증가가 멈춘다.
- 에스컬레이션: 즉시 보안/운영 담당자에게 알리고 쓰기 재개 결정을 요청한다.
- 증적: alertname, bounded failure count, 중지/재개 시각, config hash만 기록한다.

## Sf20IngestionFailure

- 감지 의미: 문서 ingestion 결과가 failure로 종료됐다.
- 첫 조치: Check gateway and worker health
- 진단: gateway health, worker health, queue age, closed outcome만 확인한다.
- 확인 및 침묵: 직접 worker 접근이나 loopback 우회는 금지한다. 침묵 상한: 30m
- 복구 조건: gateway 경유 synthetic 요청이 성공하고 failure 증가가 멈춘다.
- 에스컬레이션: 15분 안에 복구되지 않으면 신규 업로드 intake를 일시 중지한다.
- 증적: alertname, safe correlation ref, outcome, duration, 시각만 기록한다.

## Sf20QueueAgeHigh

- 감지 의미: 등록된 pg-boss queue 중 가장 오래된 active job이 300초를 넘었다.
- 첫 조치: Identify the oldest registered queue
- 진단: queue 이름, depth, oldest age만 확인하고 job payload를 조회하지 않는다.
- 확인 및 침묵: backlog가 감소하는 동안만 한시 침묵한다. 침묵 상한: 30m
- 복구 조건: 모든 queue oldest age가 300초 이하로 내려간다.
- 에스컬레이션: 동일 queue가 15분 정체되면 해당 worker를 안전하게 재시작한다.
- 증적: queue 이름, depth, oldest age, ack/resolve 시각만 기록한다.

## Sf20ScannerUnavailable

- 감지 의미: 검증된 ClamAV signature 시각을 집계할 수 없다.
- 첫 조치: Keep files quarantined and check ClamAV
- 진단: ClamAV health와 signature volume 상태를 확인하되 파일 원문은 열지 않는다.
- 확인 및 침묵: promotion은 계속 fail-closed로 유지한다. 침묵 상한: 15m
- 복구 조건: scanner availability가 1이고 새 synthetic scan이 clean으로 끝난다.
- 에스컬레이션: 즉시 신규 파일 promotion 중지를 확인하고 보안 담당자에게 알린다.
- 증적: alertname, availability, bounded scanner status, 시각만 기록한다.

## Sf20ScannerSignatureStale

- 감지 의미: 가장 최근 검증 signature가 86,400초보다 오래됐다.
- 첫 조치: Keep files quarantined and refresh signatures
- 진단: signature age와 ClamAV health를 확인하고 infected metadata는 보존하지 않는다.
- 확인 및 침묵: stale 상태에서 promotion 예외를 만들지 않는다. 침묵 상한: 15m
- 복구 조건: signature age가 86,400초 이하이고 synthetic scan이 통과한다.
- 에스컬레이션: 갱신 실패 시 네트워크/배포 담당자에게 signature 공급 경로를 요청한다.
- 증적: alertname, signature age, refresh 결과 code, 시각만 기록한다.

## Sf20QuarantineAgeHigh

- 감지 의미: non-promoted 격리 객체가 존재하며 가장 오래된 항목이 3,600초를 넘었다.
- 첫 조치: Inspect scanner and promotion backlog
- 진단: quarantine count, oldest age, scanner availability, queue age만 본다.
- 확인 및 침묵: 원본을 삭제하거나 강제 promotion하지 않는다. 침묵 상한: 30m
- 복구 조건: oldest age가 3,600초 이하이거나 backlog가 정상 정책으로 해소된다.
- 에스컬레이션: infected/security-hold는 보안 담당자에게, error는 운영 담당자에게 전달한다.
- 증적: count, oldest age, bounded state class, 시각만 기록한다.

## Sf20DatabaseUnavailable

- 감지 의미: tenant-scoped aggregate DB 관찰이 실패했다.
- 첫 조치: Stop writes and verify managed database health
- 진단: managed DB health, private endpoint, pool count를 확인하고 RLS를 우회하지 않는다.
- 확인 및 침묵: 데이터 쓰기는 DB와 audit가 함께 정상일 때만 재개한다. 침묵 상한: 15m
- 복구 조건: database availability가 1이고 tenant isolation synthetic query가 통과한다.
- 에스컬레이션: 즉시 managed DB 운영자에게 연락하고 PITR 필요 여부를 판단한다.
- 증적: alertname, availability, pool counts, fire/resolve 시각만 기록한다.

## Sf20DatabasePoolWaiting

- 감지 의미: DB pool에서 연결 대기 요청이 5분 이상 존재한다.
- 첫 조치: Check slow requests before changing limits
- 진단: waiting/total/idle 집계와 latency만 확인하고 즉시 pool 크기를 늘리지 않는다.
- 확인 및 침묵: 원인 query가 격리된 동안만 한시 적용한다. 침묵 상한: 30m
- 복구 조건: waiting이 0으로 돌아오고 API latency가 정상 범위다.
- 에스컬레이션: 반복 시 bounded query-plan 검토를 요청한다.
- 증적: pool counts, p95, fire/resolve 시각만 기록한다.

## Sf20StorageFailure

- 감지 의미: storage adapter 경계에서 bounded failure가 발생했다.
- 첫 조치: Stop mutations and verify exact-version storage access
- 진단: error class, managed storage health, private endpoint, versioning/Object Lock을 확인한다.
- 확인 및 침묵: immutable original이나 exact-version 검증을 우회하지 않는다. 침묵 상한: 15m
- 복구 조건: exact-version HEAD와 synthetic put/read가 승인된 경로에서 성공한다.
- 에스컬레이션: access 또는 versioning 오류는 즉시 보안/스토리지 운영자에게 전달한다.
- 증적: bounded error class, operation result, config hash, 시각만 기록한다.

## Sf20BackupStatusUnavailable

- 감지 의미: 닫힌 backup status 문서가 없거나 malformed/future/symlink/oversized 상태다.
- 첫 조치: Verify the sealed backup status input
- 진단: 파일 소유권, regular-file 여부, schema version, timestamp만 확인한다.
- 확인 및 침묵: status를 추정해 건강으로 표시하지 않는다. 침묵 상한: 15m
- 복구 조건: 승인된 백업 절차가 새 closed status를 원자적으로 제공한다.
- 에스컬레이션: 즉시 백업 담당자에게 sealed manifest와 status 재생성을 요청한다.
- 증적: schema, backup 시각, status hash, fire/resolve 시각만 기록한다.

## Sf20BackupStale

- 감지 의미: 최신 승인 백업이 3,600초 RPO를 초과했다.
- 첫 조치: Run the approved backup procedure
- 진단: backup age, last status hash, provider PITR receipt 상태만 확인한다.
- 확인 및 침묵: 새 백업 완료 없이 alert를 닫지 않는다. 침묵 상한: 15m
- 복구 조건: 새 sealed backup status가 생성되고 age가 3,600초 이하가 된다.
- 에스컬레이션: 15분 안에 실행되지 않으면 변경 동결과 복구 책임자 호출을 요청한다.
- 증적: backup 시각, age, manifest hash, resolve 시각만 기록한다.

## Sf20RestoreRtoExceeded

- 감지 의미: 마지막 격리 복구 검증이 14,400초 RTO를 초과했다.
- 첫 조치: Review the latest isolated restore receipt
- 진단: 단계별 duration과 검증 결과만 확인하고 production에 복원하지 않는다.
- 확인 및 침묵: 개선 작업 ticket이 활성인 동안만 적용한다. 침묵 상한: 60m
- 복구 조건: 다음 격리 복구가 14,400초 이하로 완료되고 integrity 검증이 통과한다.
- 에스컬레이션: 백업 방식 또는 용량 계획 재검토를 운영 책임자에게 요청한다.
- 증적: receipt hash, total duration, 단계별 bounded duration만 기록한다.

## Sf20DiskStatsUnavailable

- 감지 의미: 지정된 bounded filesystem의 통계를 읽을 수 없다.
- 첫 조치: Verify the bounded monitored filesystem
- 진단: mount 존재, read-only root, bounded writable volume 상태를 확인한다.
- 확인 및 침묵: disk pressure가 없다고 추정하지 않는다. 침묵 상한: 30m
- 복구 조건: disk availability가 1이고 free ratio가 정상적으로 수집된다.
- 에스컬레이션: filesystem/mount 변경은 승인된 host 작업으로 넘긴다.
- 증적: availability, free ratio, mount class, 시각만 기록한다.

## Sf20DiskPressure

- 감지 의미: monitored filesystem free ratio가 15% 미만으로 5분 지속됐다.
- 첫 조치: Stop nonessential work and reclaim bounded storage
- 진단: Prometheus retention, container local-log bound, named volume 사용량을 확인한다.
- 확인 및 침묵: 실제 공간 회수 없이 침묵하지 않는다. 침묵 상한: 15m
- 복구 조건: free ratio가 15% 이상이며 증가 추세가 안정된다.
- 에스컬레이션: 즉시 신규 비필수 ingestion을 중지하고 host 운영자에게 용량 조치를 요청한다.
- 증적: free ratio, 중지/회수/resolve 시각, cleanup result만 기록한다.

## 알림 드릴과 증적 경계

로컬 드릴은 DB unavailable, queue age, scanner stale, audit failure,
backup stale, disk pressure를 각각 `fire -> delivery -> acknowledgement ->
recovery -> resolved delivery` 순서로 확인한다. receipt에는 alertname,
bounded state, timestamp, duration, delivery count, config/image digest,
cleanup result만 허용한다. 로컬 성공은 `TECHNICAL_PASS`이며 배포 또는
외부 알림 전달 준비 완료를 의미하지 않는다.
