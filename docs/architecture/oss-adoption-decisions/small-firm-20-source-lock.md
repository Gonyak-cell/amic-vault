# SF20 최소 OSS source-lock 결정

기준: `origin/main@287c9e3f52b2b8fbc0b6ade8bab5d56d47cf80e9`

최대 20명 로펌 profile은 OSS 전체 제품을 포크하거나 제품 트리에 복사하지
않는다. 공식 저장소를 별도 source-lab에 복제해 source/test/license를 검증하고,
제품에는 공식 image 또는 독립 작성한 최소 config/adapter만 사용한다.

| 후보         | 결정                  | 제품에 들어오는 것                                   | 제품에 들어오지 않는 것              |
| ------------ | --------------------- | ---------------------------------------------------- | ------------------------------------ |
| NGINX        | L1 채택               | digest-pinned 공식 image, 독립 작성 mTLS config      | upstream C/Perl source·fixture       |
| Prometheus   | L1 채택               | digest-pinned 공식 image, bounded scrape/rule config | upstream Go source·public dashboard  |
| Alertmanager | L1 채택               | digest-pinned 공식 image, bounded route template     | upstream Go source·secret 값         |
| Ansible      | L0 조건부 도구        | SF20-03에서 독립 작성 playbook                       | GPL source/test copy, 미고정 runtime |
| pgBackRest   | L0 연구, runtime 보류 | restore-tool 비교 근거                               | SF20-03 결정 전 binary/service       |

NGINX는 TLS/인증서 검증이라는 표준 경계를 재사용해 custom proxy를 만들지 않기
위해 선택한다. Prometheus/Alertmanager는 현재 bounded metrics를 수집·알림하는
외부 프로세스로만 쓰고 audit authority를 대체하지 않는다. Ansible의 GPL
source는 복사·링크하지 않고 외부 실행 도구로만 평가한다. pgBackRest는 exact
source를 확보했지만 native PostgreSQL tooling보다 유리한지는 실제
backup/isolated-restore 설계에서 결정한다.

모든 runtime 사용은 `security/small-firm-20-profile.yml`의 source/artifact
identity와 일치해야 한다. source clone 존재는 의존성 추가, 배포, 외부 시스템
변경, 운영 적합성 또는 go-live 승인이 아니다.
