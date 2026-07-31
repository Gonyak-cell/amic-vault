# SF-B368 실제 브라우저 상호작용 증거

- 구현 코드 SHA: `1d0333c9ba957dfced1d4d893ef30e0261b9e39d`
- production build 실행: API `http://localhost:3001`, Web `http://localhost:3000`
- 검증일: 2026-07-31 KST
- 행렬 원본: [`browser-matrix.json`](./browser-matrix.json)

## 화면과 리플로우

- 홈, Matter 목록·상세, 고객, 문서함, 검색, 작업함, 관리자 설정, Matter 관리 시스템 상태의 9개 화면을 `1440x900`, `1024x768`, `768x1024`, `390x844`에서 확인했다.
- 36개 조합 모두 페이지 수준 가로 넘침 0, 안정 상태 loading/error 0, visible unnamed interactive control 0이었다.
- `720x450`에서 홈, Matter 상세, 작업함을 200% 확대 상당 CSS viewport로 다시 확인했다. 세 화면 모두 `documentWidth=clientWidth=720`이었다.
- 대표 캡처: [`dashboard-1440x900.jpg`](./dashboard-1440x900.jpg), [`matter-mobile-390x844.jpg`](./matter-mobile-390x844.jpg)

## 키보드·포커스·이력

- Matter `개요` 탭에서 `ArrowRight`를 누르면 선택과 focus가 `문서`로 이동하고 URL이 `?tab=documents#matter-files`로 바뀌었다.
- browser back은 `개요`, forward와 reload는 `문서` 선택과 URL을 복원했다.
- 390px 모바일 메뉴를 열면 dialog가 1개 생성되고 focus가 `메뉴 닫기`로 이동했으며 `body overflow=hidden`이 됐다.
- `Escape` 후 dialog는 0개, body scroll은 복원되고 focus는 `메뉴 열기`로 돌아왔다.

## 역할·차단·오류

- 관리자 홈: `/admin` 메뉴 1개, `/walls` 메뉴 0개, `/audit` 링크 0개.
- 일반 구성원 홈: 홈·Matter·고객·문서함·작업함 다섯 메뉴만 표시하고 `/admin`, `/walls`, `/audit` 링크는 0개.
- 일반 구성원의 `/admin`, `/integrations/matter-app`, `/walls` 직접 접근은 URL을 홈으로 숨기지 않고 “관리자 계정에서만 사용할 수 있는 화면”으로 차단했다.
- 교차 tenant Matter와 같은 tenant의 non-member Matter 직접 URL은 동일한 안전한 “Matter를 표시할 수 없습니다” 상태를 보였고 tenant 이름이나 대상 Matter 정보를 누설하지 않았다.
- excluded/insider-required Wall과 explicit DENY는 [`automated-gates.md`](./automated-gates.md)의 저장검색·Matter 권한 통합 회귀에서 검증했다.
- API 중단 시 홈은 각 섹션을 empty로 바꾸지 않고 “연결 확인 필요 / 데이터를 표시할 수 없습니다”로 구분했다. 같은 구현 SHA의 API를 재기동하고 reload하자 접근 가능한 Matter 5개가 다시 표시됐다.
- 장애 주입 전 최종 성공 화면의 browser console warn/error는 0건이었다.

## 사용자 문구

- 홈 최근 활동은 정보를 유지하되 dead `/audit` section/item 링크가 0개다.
- 기본 내비게이션과 관리자 허브에 “정보 차단” 메뉴가 없다.
- 일반 화면에서 `권한으로 보호됨` 또는 상시 보안 홍보 문구를 사용하지 않는다.
