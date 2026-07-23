# SF20 parser 후보 측정·결정

## 결론

소형 로펌 20인 기준 필수 synthetic corpus 12개는 현재의 bounded
Python/LibreOffice/Tesseract 경로가 모두 충족한다. 따라서 Gotenberg,
Apache Tika, OCRmyPDF는 이번 baseline에 설치하지 않으며 모두
`REJECT_FOR_SF20_BASELINE`이다. 공개소스라는 사실만으로 서비스 수와
공격면을 늘리지 않는다.

이는 영구 기각이 아니다. 같은 corpus에서 현재 parser의 재현 가능한 실패가
생기고 정확히 한 후보가 그 실패를 닫는 경우 evaluator가
`ADOPT_TRIGGER_MET`으로 바뀐다. 그때에도 별도 PACK, 이미지 digest,
bounded adapter, 격리·rollback 증명 없이는 런타임 채택되지 않는다.

## 공개소스 로컬 활용 증적

제품 트리 밖의 분리된 source lab
`.oss-source-lab/clones/{tika,ocrmypdf}`에 공식 태그를 sparse clone했다.
복제본은 연구 전용이며 커밋하지 않는다. 제품에는 upstream 소스·테스트·fixture
코드를 복사하지 않고 exact pin과 독립적으로 작성한 평가만 남긴다.

| 후보 | 공식 release | commit / tree | license | source·test·security 관찰 | 태그 |
|---|---|---|---|---|---|
| Gotenberg | 기존 2026-07-21 reference pin | `0c8d681…` / `0845582…` | MIT | PDF engine와 fallback test 기존 pin 재사용 | 기존 pin |
| Apache Tika | `3.3.2` | `b8a6916…` / `eaf6611…` | Apache-2.0, `ad5f4c4…` | `ForkParser`, `ForkParserTest`, `SECURITY.md` blob 고정 | annotated, GitHub unsigned |
| OCRmyPDF | `v17.8.1` | `9cda023…` / `661876c…` | MPL-2.0, `1f256ec…` | OCR pipeline, pipeline test, PDF security 문서 blob 고정 | annotated, GitHub verified |

전체 해시와 blob은
`security/oss-source-map.yml` 및
`tests/fixtures/ingestion-sandbox/parser-candidate-corpus.json`이
machine-readable authority다. 로컬 복제 검증은 다음과 같다.

```bash
OSS_RESEARCH_ROOT=/path/to/.oss-source-lab \
  node tools/oss/evaluate-parser-candidates.mjs
```

## 측정 결과

| 후보 | 필수 coverage 증가 | latency / memory class | 실패·보안 성격 | 운영비 | 결정 |
|---|---:|---|---|---:|---|
| Gotenberg | 0/12 | 외부 service roundtrip / office·browser high | 별도 HTTP timeout·network 경계 필요 | 서비스 +1 | `REJECT_FOR_SF20_BASELINE` |
| Apache Tika | 0/12 | 외부 JVM roundtrip / high | fork 격리는 참고할 수 있으나 malware boundary가 아님 | 서비스 +1 | `REJECT_FOR_SF20_BASELINE` |
| OCRmyPDF | 0/12 | multi-process page pipeline / high | searchable derivative 도구이며 보안 보증이 아님 | 서비스 +1 | `REJECT_FOR_SF20_BASELINE` |

현재 baseline의 요구 결과는 검색 가능한 파생 PDF 생성이 아니라 원본 불변을
유지한 한국어·영어 OCR text 추출이다. OCRmyPDF의 파생 PDF/PDF-A/deskew
품질이 실제 사건 문서 corpus에서 별도 요구가 되면 새 synthetic acceptance
case와 승인된 후속 PACK으로 다시 측정한다.

## 검증 및 rollback

- evaluator를 두 번 실행한 JSON 결과는 byte-equivalent하다.
- 한 corpus case를 의도적으로 실패로 바꾸면 그 case를 닫는 후보만
  `ADOPT_TRIGGER_MET`이 된다.
- source/license/security blob이 빠지면 `BLOCKED_SOURCE_EVIDENCE`이며 채택으로
  승격되지 않는다.
- production Compose, Node/Python manifest와 lockfile에는 후보 서비스,
  adapter, dependency가 0개다.
- 이번 결정의 rollback은 코드 제거가 아니라 decision row를 이전
  `BLOCKED_PENDING_OSS05_SCOPE`로 되돌리는 문서 변경뿐이다.
