import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Activity,
  Archive,
  ArrowRight,
  Bell,
  Blocks,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  DatabaseZap,
  FileCheck2,
  FileCog,
  FolderKanban,
  Gauge,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  Network,
  PanelsTopLeft,
  Shield,
  Timer,
  Users,
} from 'lucide-react';

type ShowcaseTheme = 'classic' | 'saas';

export const metadata: Metadata = {
  title: 'AMIC Vault 쇼케이스',
  description: '보안 중심 법무팀을 위한 Matter 중심 문서 Vault 쇼케이스.',
};

const navItems = [
  { label: '개요', href: '#overview' },
  { label: '뷰', href: '#views' },
  { label: '거버넌스', href: '#governance' },
  { label: '리포팅', href: '#reporting' },
];

const overviewCards = [
  {
    icon: FolderKanban,
    title: 'Matter, 폴더, 목록',
    body: '클라이언트, Matter, 관계자, 버전, 검토 업무를 권한이 반영된 하나의 화면에서 관리합니다.',
    accent: 'text-[#ef4d86] bg-[#fff0f6]',
  },
  {
    icon: FileCog,
    title: '맞춤형 업무 흐름',
    body: '검토, 업로드, 파일링, 특권 검토, 증거 인계를 업무 그룹의 실제 흐름에 맞게 구성합니다.',
    accent: 'text-[#14a3c7] bg-[#e9fbff]',
  },
  {
    icon: GitBranch,
    title: '하위 업무와 체크리스트',
    body: '인입, 마스킹, OCR, 승인 단계를 담당자, 상태, 기한이 남는 추적 가능한 업무로 전환합니다.',
    accent: 'text-[#d8a305] bg-[#fff8d7]',
  },
  {
    icon: Shield,
    title: '권한 우선 검색',
    body: '쿼리 실행 전에 검색 범위를 제한해 허용되지 않은 제목, 스니펫, 메타데이터가 노출되지 않습니다.',
    accent: 'text-[#6b5cff] bg-[#f0eeff]',
  },
];

const viewTabs = ['Matter', '검색', '파일', '감사 로그', '보존 관리', 'AI 통제', '관계 맵', '실사', '소송'];

const customizationCards = [
  {
    icon: Blocks,
    title: 'Vault 앱',
    body: 'Matter, 검색, 감사 로그, 보존 관리를 하나의 로펌 운영 화면으로 조합합니다.',
    color: 'bg-[#ffc928] text-[#503d00]',
  },
  {
    icon: BrainCircuit,
    title: 'AI 거버넌스',
    body: '외부 AI 연결을 기본 차단한 상태에서 접근 권한, 인용 근거, 정책 상태를 투명하게 보여줍니다.',
    color: 'bg-[#efeaff] text-[#4d3abd]',
  },
  {
    icon: ListChecks,
    title: '템플릿',
    body: 'Matter 인입, 클로징 바인더, 소송 패키지, 실사 체크리스트를 필수 통제와 함께 시작합니다.',
    color: 'bg-[#fff7df] text-[#8b6500]',
  },
  {
    icon: Network,
    title: '관계 맵',
    body: '고객, Matter, 관계자, 계약, 판례와 근거 자료를 내부 지식 그래프로 연결합니다.',
    color: 'bg-[#fff0f6] text-[#b91d60]',
  },
  {
    icon: DatabaseZap,
    title: '연동',
    body: '파일, 이메일, 감사 로그, 보존 서비스를 명확한 증빙 ID와 워크스페이스 보안 경로로 정렬합니다.',
    color: 'bg-[#e8fbff] text-[#08748e]',
  },
];

const reportingCards = [
  {
    icon: LayoutDashboard,
    title: '대시보드',
    body: '업로드량, 검색 상태, 권한 거부, 감사 범위, 승인 상태를 하나의 운영 화면에서 추적합니다.',
    tint: 'from-[#ff7272] to-[#ff9f86]',
  },
  {
    icon: ClipboardCheck,
    title: '업무량과 검토',
    body: '검토자 부하, 대기 승인, 장기 미처리 Matter, 예외 큐를 업무 지연 전에 확인합니다.',
    tint: 'from-[#6b5cff] to-[#9a8cff]',
  },
  {
    icon: Gauge,
    title: '목표',
    body: '출시, 마이그레이션, 증거, 보안 목표를 측정 가능한 통과 기준과 연결합니다.',
    tint: 'from-[#f2bd14] to-[#ffd85d]',
  },
  {
    icon: Archive,
    title: '마일스톤',
    body: '기록, 보존, 폐기 준비, 승인 상태를 원본 패키지 증거를 변경하지 않고 표시합니다.',
    tint: 'from-[#ef4d86] to-[#ff83b2]',
  },
  {
    icon: Bell,
    title: '펄스',
    body: '감사 이상, 오래된 권한, 누락된 체크, 검색 회귀를 운영 신호로 드러냅니다.',
    tint: 'from-[#29b7d4] to-[#8fe7f6]',
  },
];

const timeCards = [
  {
    icon: Timer,
    title: '추적',
    body: 'Matter 활동, 문서 처리, 게이트 작업이 감사 스트림에 시간과 함께 기록됩니다.',
    accent: 'bg-[#ffb13b]',
  },
  {
    icon: FileCheck2,
    title: '예측',
    body: '현재 증거 상태를 기준으로 검토 창, 마이그레이션 리허설, 큐 깊이를 계획합니다.',
    accent: 'bg-[#596bff]',
  },
  {
    icon: Activity,
    title: '보고',
    body: '보안, 기록, 출시 요약을 내부 검토용 패킷으로 간결하게 내보낼 수 있습니다.',
    accent: 'bg-[#2bc98f]',
  },
];

const footerColumns = [
  ['제품', '홈', 'Matter', '검색', '감사 로그', '보존 관리'],
  ['보안', '권한 필터', '정보 장벽', 'DLP 점검', 'AI 정책', '워크스페이스 격리'],
  ['워크플로', '업로드 검토', '계약 검토', '실사 자료', '소송 자료', '운영 관리'],
  ['회사', '소개', '운영', '승인 관리', '상태', '문의'],
];

export default function ShowcasePage({ searchParams }: { searchParams?: { theme?: string } }) {
  const theme: ShowcaseTheme = searchParams?.theme === 'classic' ? 'classic' : 'saas';

  return (
    <main className="min-h-screen bg-white text-[#17202a]" data-showcase-theme={theme}>
      <ThemeSelector activeTheme={theme} />
      {theme === 'saas' ? (
        <SaasDesignSystemTheme />
      ) : (
        <>
          <HeroSection />
          <OverviewSection />
          <ViewsSection />
          <CustomizationSection />
          <CollaborationSection />
          <DocumentSection />
          <ReportingSection />
          <TimeSection />
          <MoreSection />
          <ShowcaseFooter />
        </>
      )}
    </main>
  );
}

function ThemeSelector({ activeTheme }: { activeTheme: ShowcaseTheme }) {
  const options: { theme: ShowcaseTheme; label: string; description: string; href: string }[] = [
    {
      theme: 'classic',
      label: '기존 Vault 테마',
      description: '컬러풀한 쇼케이스형 화면',
      href: '/showcase?theme=classic',
    },
    {
      theme: 'saas',
      label: 'SaaS Design System 테마',
      description: '실제 업무 화면에 가까운 새 테마',
      href: '/showcase?theme=saas',
    },
  ];

  return (
    <section className="sticky top-0 z-30 border-b border-[#dbe4f0] bg-white/92 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-md bg-[#eef4ff]">
            <img src="/icons/amic-vault-icon.svg" alt="" className="h-9 w-9" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#17202a]">디자인 테마 선택</p>
            <p className="text-xs font-medium text-[#667085]">운영자가 비교할 테마를 선택할 수 있습니다.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {options.map((option) => {
            const active = option.theme === activeTheme;
            return (
              <Link
                key={option.theme}
                href={option.href}
                aria-current={active ? 'page' : undefined}
                className={`min-w-[190px] rounded-md border px-4 py-2 text-left transition ${
                  active
                    ? 'border-[#1464e8] bg-[#eef4ff] text-[#0f4fb9] shadow-sm'
                    : 'border-[#dbe4f0] bg-white text-[#344054] hover:bg-[#f8fbff]'
                }`}
              >
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="mt-0.5 block text-xs font-medium text-[#667085]">{option.description}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SaasDesignSystemTheme() {
  return (
    <>
      <section className="bg-[#f8fafd]">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
          <div className="overflow-hidden rounded-lg border border-[#dbe4f0] bg-white shadow-[0_24px_70px_rgb(32_46_75_/_10%)]">
            <header className="grid min-h-16 gap-0 bg-[linear-gradient(90deg,#1448c4_0%,#1464e8_100%)] text-white md:grid-cols-[255px_minmax(0,1fr)]">
              <Link href="/showcase?theme=saas" className="flex items-center gap-3 border-white/15 px-5 md:border-r">
                <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-md bg-white/14 ring-1 ring-white/20">
                  <img src="/icons/amic-vault-icon.svg" alt="" className="h-9 w-9" />
                </span>
                <img src="/icons/amic-vault-wordmark.svg" alt="AMIC Vault" className="h-[18px] w-[88px] brightness-0 invert" />
              </Link>
              <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-h-9 max-w-xl flex-1 items-center gap-2 rounded-md bg-white/15 px-3 text-sm font-medium text-white/72">
                  <span className="h-3 w-3 rounded-full border border-white/70" />
                  Matter, 파일, 감사 로그 검색
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-white/80">
                  <span className="rounded-md bg-white/14 px-3 py-2">운영 상태 정상</span>
                  <Link href="/login" className="rounded-md bg-white px-3 py-2 text-[#1254c9]">
                    로그인
                  </Link>
                </div>
              </div>
            </header>

            <div className="grid min-h-[720px] bg-[#f8fafd] lg:grid-cols-[255px_minmax(0,1fr)]">
              <aside className="border-b border-[#e5eaf3] bg-[#fafafa] p-4 lg:border-b-0 lg:border-r">
                <div className="rounded-md border border-[#e8ecf4] bg-white p-3">
                  <p className="text-[11px] font-bold uppercase text-[#8a97a8]">워크스페이스</p>
                  <p className="mt-1 text-sm font-bold text-[#1a1f36]">AMIC Legal Ops</p>
                  <p className="mt-0.5 text-xs font-medium text-[#4a5a70]">보안 업무공간</p>
                </div>
                <div className="mt-4 space-y-5">
                  <SaasNavGroup
                    label="작업"
                    items={[
                      ['홈', '12'],
                      ['Matter', '48'],
                      ['파일', '248'],
                      ['검색', ''],
                    ]}
                  />
                  <SaasNavGroup
                    label="통제"
                    items={[
                      ['감사 로그', '1.8k'],
                      ['정보 장벽', '6'],
                      ['보존 관리', '3'],
                      ['AI 정책', '차단'],
                    ]}
                  />
                  <SaasNavGroup
                    label="운영"
                    items={[
                      ['팀', '18'],
                      ['리포트', ''],
                      ['관리자 설정', ''],
                    ]}
                  />
                </div>
                <div className="mt-8 rounded-md border border-[#e8ecf4] bg-white p-3 text-xs text-[#4a5a70]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">동기화</span>
                    <span className="h-2 w-2 rounded-full bg-[#2bc98f]" />
                  </div>
                  <p className="mt-2 leading-5">방금 전 업데이트됨</p>
                </div>
              </aside>

              <section className="min-w-0 p-4 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#8a97a8]">홈</p>
                    <h1 className="mt-2 text-3xl font-bold tracking-normal text-[#1a1f36] sm:text-4xl">오늘 처리할 법무 업무</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#4a5a70]">
                      Matter, 파일, 권한, 감사 로그를 한 화면에서 확인하고 필요한 작업부터 진행합니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/dashboard" className="rounded-md border border-[#dbe4f0] bg-white px-4 py-2 text-sm font-bold text-[#344054]">
                      대시보드 열기
                    </Link>
                    <Link href="/showcase?theme=classic" className="rounded-md bg-[#1464e8] px-4 py-2 text-sm font-bold text-white">
                      기존 테마 보기
                    </Link>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <SaasMetricCard label="검토 대기" value="18" helper="어제보다 4건 감소" tone="blue" />
                  <SaasMetricCard label="권한 차단" value="0" helper="누수 없음" tone="green" />
                  <SaasMetricCard label="감사 이벤트" value="1,842" helper="오늘 기록" tone="amber" />
                  <SaasMetricCard label="보존 항목" value="3" helper="검토 필요" tone="rose" />
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                  <article className="rounded-lg border border-[#e8ecf4] bg-white p-4 shadow-[0_2px_16px_rgb(45_45_45_/_6%)]">
                    <div className="flex flex-col gap-3 border-b border-[#f0f3f9] pb-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-lg font-bold tracking-normal text-[#1a1f36]">Matter 작업 큐</h2>
                        <p className="mt-1 text-sm text-[#4a5a70]">담당자, 상태, 권한 범위를 함께 확인합니다.</p>
                      </div>
                      <div className="flex gap-2 text-xs font-bold">
                        {['목록', '보드', '타임라인'].map((item, index) => (
                          <span key={item} className={`rounded-md px-3 py-1.5 ${index === 0 ? 'bg-[#ebf1ff] text-[#1464e8]' : 'bg-[#f8fafd] text-[#6b778c]'}`}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-md border border-[#e8ecf4]">
                      <div className="grid grid-cols-[1.35fr_0.7fr_0.55fr_0.55fr] bg-[#f4f6fb] px-4 py-2 text-xs font-bold text-[#6b778c]">
                        <span>Matter</span>
                        <span>담당</span>
                        <span>상태</span>
                        <span>기한</span>
                      </div>
                      {[
                        ['서울 JV 중재', '민아', '검토', '오늘'],
                        ['Cobalt 인수 자문', '다니엘', '파일링', '내일'],
                        ['특허 침해 대응', '지윤', '권한 확인', '6월 18일'],
                        ['공시자료 정리', '서준', '보존', '6월 20일'],
                      ].map(([matter, owner, status, due]) => (
                        <div key={matter} className="grid grid-cols-[1.35fr_0.7fr_0.55fr_0.55fr] border-t border-[#f0f3f9] px-4 py-3 text-sm">
                          <span className="min-w-0 font-bold text-[#1a1f36]">{matter}</span>
                          <span className="text-[#4a5a70]">{owner}</span>
                          <span className="font-semibold text-[#1464e8]">{status}</span>
                          <span className="text-[#4a5a70]">{due}</span>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-lg border border-[#e8ecf4] bg-white p-4 shadow-[0_2px_16px_rgb(45_45_45_/_6%)]">
                    <h2 className="text-lg font-bold tracking-normal text-[#1a1f36]">권한과 감사</h2>
                    <p className="mt-1 text-sm text-[#4a5a70]">외부 노출 없이 내부 통제 상태만 보여줍니다.</p>
                    <div className="mt-5 space-y-3">
                      <SaasQueueCard label="권한 범위 적용" value="정상" tone="green" />
                      <SaasQueueCard label="정보 장벽 체크" value="통과" tone="blue" />
                      <SaasQueueCard label="AI 정책" value="외부 AI 차단" tone="amber" />
                      <SaasQueueCard label="감사 로그" value="기록 중" tone="blue" />
                    </div>
                  </article>
                </div>

                <div className="mt-6 grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
                  <article className="rounded-lg border border-[#e8ecf4] bg-white p-4 shadow-[0_2px_16px_rgb(45_45_45_/_6%)]">
                    <h2 className="text-lg font-bold tracking-normal text-[#1a1f36]">검토 단계</h2>
                    <div className="mt-5 space-y-4">
                      {[
                        ['파일 수신', '완료', 100],
                        ['OCR 및 인덱싱', '진행 중', 72],
                        ['특권 검토', '대기', 38],
                        ['기록 라벨', '대기', 24],
                      ].map(([label, state, progress]) => (
                        <div key={label as string}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-bold text-[#1a1f36]">{label}</span>
                            <span className="font-semibold text-[#6b778c]">{state}</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-[#eef2f7]">
                            <div className="h-full rounded-full bg-[#1464e8]" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="rounded-lg border border-[#e8ecf4] bg-white p-4 shadow-[0_2px_16px_rgb(45_45_45_/_6%)]">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-lg font-bold tracking-normal text-[#1a1f36]">오늘의 감사 타임라인</h2>
                        <p className="mt-1 text-sm text-[#4a5a70]">사용자에게 필요한 표현만 남긴 새 운영형 테마입니다.</p>
                      </div>
                      <span className="rounded-md bg-[#fff3e0] px-3 py-1.5 text-xs font-bold text-[#9a5c00]">실시간</span>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                      <SaasTimeline time="09:44" title="파일 열람 허용" detail="서울 JV 중재, 권한 범위 안에서 처리됨" />
                      <SaasTimeline time="09:41" title="정보 장벽 통과" detail="제외 대상 없이 검색 범위 확정" />
                      <SaasTimeline time="09:36" title="새 버전 생성" detail="원본 보존, 새 파일 버전으로 등록" />
                      <SaasTimeline time="09:20" title="검색 조건 적용" detail="Matter와 문서 권한을 먼저 확인" />
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
      <footer className="border-t border-[#e8ecf4] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-normal text-[#1a1f36]">SaaS Design System 미리보기</h2>
            <p className="mt-1 text-sm text-[#4a5a70]">새 테마는 운영형 Vault 화면에 맞춰 AWS 배포 페이지에 포함됩니다.</p>
          </div>
          <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-md bg-[#1464e8] px-4 text-sm font-bold text-white">
            로그인으로 돌아가기
          </Link>
        </div>
      </footer>
    </>
  );
}

function SaasNavGroup({ label, items }: { label: string; items: [string, string][] }) {
  return (
    <div>
      <p className="px-2 text-[11px] font-bold uppercase text-[#8a97a8]">{label}</p>
      <div className="mt-2 space-y-1">
        {items.map(([item, count], index) => (
          <div
            key={item}
            className={`flex h-9 items-center justify-between rounded-md px-3 text-sm font-semibold ${
              index === 0 ? 'bg-[#eaf1ff] text-[#1464e8]' : 'text-[#1a1f36] hover:bg-[#f1f5fb]'
            }`}
          >
            <span>{item}</span>
            {count ? <span className="text-xs font-bold text-[#8a97a8]">{count}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SaasMetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: 'blue' | 'green' | 'amber' | 'rose';
}) {
  const toneClass = {
    blue: 'bg-[#ebf1ff] text-[#1464e8]',
    green: 'bg-[#e9fbf4] text-[#0b7a53]',
    amber: 'bg-[#fff3e0] text-[#9a5c00]',
    rose: 'bg-[#ffebee] text-[#b72b3a]',
  }[tone];

  return (
    <article className="rounded-lg border border-[#e8ecf4] bg-white p-4 shadow-[0_2px_16px_rgb(45_45_45_/_6%)]">
      <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${toneClass}`}>{label}</span>
      <p className="mt-4 text-3xl font-bold tracking-normal text-[#1a1f36]">{value}</p>
      <p className="mt-1 text-sm font-medium text-[#4a5a70]">{helper}</p>
    </article>
  );
}

function SaasQueueCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'amber';
}) {
  const dotClass = {
    blue: 'bg-[#1464e8]',
    green: 'bg-[#2bc98f]',
    amber: 'bg-[#ff9500]',
  }[tone];

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[#f0f3f9] bg-[#f8fafd] p-3">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
        <span className="text-sm font-bold text-[#1a1f36]">{label}</span>
      </div>
      <span className="text-xs font-bold text-[#4a5a70]">{value}</span>
    </div>
  );
}

function SaasTimeline({ time, title, detail }: { time: string; title: string; detail: string }) {
  return (
    <div className="rounded-md border border-[#f0f3f9] bg-[#f8fafd] p-3">
      <p className="font-mono text-xs font-bold text-[#8a97a8]">{time}</p>
      <h3 className="mt-2 text-sm font-bold tracking-normal text-[#1a1f36]">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-[#4a5a70]">{detail}</p>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-[#f8fbff] pb-20 text-white">
      <div className="absolute inset-x-0 top-0 -z-10 h-[760px] bg-[linear-gradient(124deg,#6b3dff_0%,#7946ff_35%,#18aeea_100%)]" />
      <div
        className="absolute inset-x-0 top-[620px] -z-10 h-40 bg-white"
        style={{ clipPath: 'polygon(0 48%, 14% 72%, 72% 50%, 93% 40%, 100% 0, 100% 100%, 0 100%)' }}
      />
      <ShowcaseNav />
      <div className="mx-auto flex max-w-6xl flex-col items-center px-5 pb-6 pt-16 text-center sm:px-8 sm:pt-20">
        <h1 className="max-w-4xl text-[42px] font-bold leading-[1.06] tracking-normal sm:text-[58px] lg:text-[70px]">
          모든 Matter, 문서, 결정을 위한 하나의 보안 작업공간.
        </h1>
        <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-white/86 sm:text-lg">
          AMIC Vault는 권한 기반 검색, 변경 불가능한 문서 이력, 정보 장벽, 감사 우선 운영을 하나의 법무 데이터
          플랫폼으로 묶습니다.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-[#4b32c9] shadow-[0_16px_40px_rgb(58_32_170_/_24%)] transition hover:bg-white/94"
          >
            대시보드 열기
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="#overview"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-white/36 bg-white/12 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/18"
          >
            쇼케이스 보기
          </Link>
        </div>
        <HeroWorkspaceMockup />
      </div>
    </section>
  );
}

function ShowcaseNav() {
  return (
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
      <Link href="/showcase" className="flex items-center gap-2" aria-label="AMIC Vault 쇼케이스 홈">
        <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-md bg-white/18 ring-1 ring-white/24">
          <img src="/icons/amic-vault-icon.svg" alt="" className="h-8 w-8" />
        </span>
        <img src="/icons/amic-vault-wordmark.svg" alt="AMIC Vault" className="h-[18px] w-[86px] brightness-0 invert" />
      </Link>
      <nav className="hidden items-center gap-7 text-sm font-semibold text-white/82 md:flex" aria-label="쇼케이스">
        {navItems.map((item) => (
          <a key={item.href} href={item.href} className="hover:text-white">
            {item.label}
          </a>
        ))}
      </nav>
      <Link
        href="/login"
        className="inline-flex h-9 items-center rounded-md bg-white px-4 text-sm font-semibold text-[#4b32c9] shadow-sm"
      >
        로그인
      </Link>
    </header>
  );
}

function HeroWorkspaceMockup() {
  return (
    <div className="mt-10 w-full max-w-4xl rounded-lg bg-white p-2 text-left text-[#182232] shadow-[0_30px_90px_rgb(36_31_116_/_30%)] ring-1 ring-white/50">
      <div className="flex items-center gap-2 border-b border-[#e7eaf1] px-3 py-2">
        <span className="h-3 w-3 rounded-full bg-[#ff6f7d]" />
        <span className="h-3 w-3 rounded-full bg-[#ffd15b]" />
        <span className="h-3 w-3 rounded-full bg-[#59d694]" />
        <span className="ml-3 h-6 flex-1 rounded-md bg-[#f2f5fb]" />
      </div>
      <div className="grid min-h-[360px] gap-0 overflow-hidden rounded-b-md md:grid-cols-[190px_minmax(0,1fr)_220px]">
        <aside className="hidden border-r border-[#e7eaf1] bg-[#f8f9ff] p-4 md:block">
          <p className="text-xs font-bold uppercase text-[#6b7280]">공간</p>
          {['기업 자문', '소송', '실사', '기록'].map((space, index) => (
            <div
              key={space}
              className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                index === 1 ? 'bg-white text-[#5d47df] shadow-sm' : 'text-[#667085]'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#6b5cff]" />
              {space}
            </div>
          ))}
        </aside>
        <div className="min-w-0 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#6b7280]">Matter</p>
              <h2 className="mt-1 text-xl font-bold">서울 JV 중재</h2>
            </div>
            <span className="inline-flex items-center gap-2 rounded-md bg-[#ecfdf5] px-3 py-1 text-xs font-bold text-[#047857]">
              <CheckCircle2 className="h-4 w-4" />
              권한 범위 적용
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ['문서', '248'],
              ['감사 이벤트', '1,842'],
              ['차단 누수', '0'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#e7eaf1] bg-[#fbfcff] p-3">
                <p className="text-xs text-[#667085]">{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-[#e7eaf1]">
            <div className="grid grid-cols-[1.3fr_0.7fr_0.7fr] border-b border-[#e7eaf1] bg-[#f8f9ff] px-4 py-2 text-xs font-bold text-[#667085]">
              <span>문서</span>
              <span>상태</span>
              <span>담당</span>
            </div>
            {[
              ['주식매매계약 레드라인 v7.pdf', '검토', '민아'],
              ['공시목록.docx', '보존', '다니엘'],
              ['전문가 의견서.hwpx', '파일링', '지윤'],
            ].map(([document, status, owner]) => (
              <div key={document} className="grid grid-cols-[1.3fr_0.7fr_0.7fr] px-4 py-3 text-sm">
                <span className="font-semibold">{document}</span>
                <span className="text-[#6b5cff]">{status}</span>
                <span className="text-[#667085]">{owner}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="hidden border-l border-[#e7eaf1] bg-[#fbfcff] p-4 lg:block">
          <p className="text-xs font-bold uppercase text-[#6b7280]">감사 추적</p>
          {[
            ['09:44', '열람 허용'],
            ['09:41', '장벽 체크 통과'],
            ['09:36', '버전 생성'],
            ['09:20', '검색 범위 적용'],
          ].map(([time, event]) => (
            <div key={`${time}-${event}`} className="mt-4 flex gap-3">
              <span className="font-mono text-xs text-[#8a93a3]">{time}</span>
              <span className="text-sm font-semibold">{event}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <section id="overview" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-[34px] font-bold leading-tight tracking-normal text-[#1e2530] sm:text-[42px]">
          AMIC Vault 개요.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#667085]">
          Matter 맥락, 보안 판단, 문서 증거가 함께 움직여야 하는 법무팀을 위해 설계했습니다.
        </p>
      </div>

      <div className="mt-12 grid gap-5 lg:grid-cols-[0.76fr_1.24fr]">
        <FeaturePanel
          icon={<PanelsTopLeft className="h-5 w-5" />}
          title="모든 것을 Matter 중심으로"
          body="작업공간은 Matter에서 시작해 클라이언트, 관계자, 문서군, 검색 범위, 기록 상태, 출시 증거를 그 주변에 연결합니다."
          className="bg-[linear-gradient(145deg,#714fff,#8f6dff)] text-white"
        />
        <MatterBoardMockup />
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {overviewCards.map((card) => (
          <FeaturePanel
            key={card.title}
            icon={
              <span className={`grid h-9 w-9 place-items-center rounded-md ${card.accent}`}>
                <card.icon className="h-5 w-5" />
              </span>
            }
            title={card.title}
            body={card.body}
            className="border border-[#e8ebf2] bg-white text-[#1e2530] shadow-[0_16px_45px_rgb(18_32_54_/_8%)]"
          />
        ))}
      </div>
    </section>
  );
}

function FeaturePanel({
  icon,
  title,
  body,
  className,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  className: string;
}) {
  return (
    <article className={`rounded-lg p-7 ${className}`}>
      <div>{icon}</div>
      <h3 className="mt-5 text-2xl font-bold tracking-normal">{title}</h3>
      <p className="mt-3 text-sm leading-6 opacity-80">{body}</p>
    </article>
  );
}

function MatterBoardMockup() {
  return (
    <div className="rounded-lg border border-[#e8ebf2] bg-white p-4 shadow-[0_18px_50px_rgb(18_32_54_/_9%)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f6] pb-3">
        <div className="flex items-center gap-2">
          {['Matter', '문서', '검색', '감사'].map((tab, index) => (
            <span
              key={tab}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                index === 0 ? 'bg-[#f0eeff] text-[#5d47df]' : 'text-[#778091]'
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
        <span className="text-xs font-semibold text-[#667085]">라이브 통제</span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          {[
            ['중요 파일링', '8건 대기', '#6b5cff'],
            ['권한 예외', '0건 열림', '#12a87d'],
            ['기록 보존', '3건 활성', '#f2bd14'],
          ].map(([label, value, color]) => (
            <div key={label} className="rounded-md border border-[#edf0f6] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold">{label}</span>
                <span className="text-xs font-semibold text-[#667085]">{value}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf0f6]">
                <div className="h-full rounded-full" style={{ width: label === '중요 파일링' ? '68%' : '42%', background: color }} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {['인입', '검토', '장벽 체크', '파일링', '보존', '내보내기'].map((item, index) => (
            <div key={item} className="rounded-md bg-[#f8f9ff] p-3">
              <span className="text-xs font-bold text-[#667085]">0{index + 1}</span>
              <p className="mt-2 text-sm font-bold">{item}</p>
              <div className="mt-3 h-1.5 rounded-full bg-[#e6eaff]">
                <div className="h-full rounded-full bg-[#6b5cff]" style={{ width: `${45 + index * 7}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ViewsSection() {
  return (
    <section id="views" className="bg-[linear-gradient(135deg,#6f54ff,#966cff)] px-5 py-20 text-white sm:px-8">
      <div className="mx-auto max-w-6xl text-center">
        <h2 className="mx-auto max-w-2xl text-[32px] font-bold leading-tight tracking-normal sm:text-[42px]">
          필요한 관점으로 법무 업무를 다루는 집중 뷰.
        </h2>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          {viewTabs.map((item, index) => (
            <span
              key={item}
              className={`grid h-9 min-w-9 place-items-center rounded-md px-3 text-xs font-bold ${
                index === 0 ? 'bg-white text-[#5d47df]' : 'bg-white/12 text-white/78'
              }`}
            >
              {item}
            </span>
          ))}
        </div>
        <ViewsMockup />
      </div>
    </section>
  );
}

function ViewsMockup() {
  return (
    <div className="mx-auto mt-11 max-w-4xl rounded-lg bg-white p-4 text-left text-[#182232] shadow-[0_28px_80px_rgb(45_22_142_/_26%)]">
      <div className="grid gap-4 lg:grid-cols-[170px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#edf0f6] pr-4 lg:block">
          {['전체 Matter', '내 검토', '실사', '소송', '기록'].map((item, index) => (
            <div
              key={item}
              className={`mb-2 rounded-md px-3 py-2 text-sm font-bold ${
                index === 1 ? 'bg-[#f0eeff] text-[#5d47df]' : 'text-[#667085]'
              }`}
            >
              {item}
            </div>
          ))}
        </aside>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {['보드', '캘린더', '목록', '타임라인'].map((item, index) => (
              <span
                key={item}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                  index === 0 ? 'bg-[#eef2ff] text-[#4f46e5]' : 'bg-[#f8f9ff] text-[#778091]'
                }`}
              >
                {item}
              </span>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['인입', ['NDA 업로드', '클라이언트 충돌', '관계자 목록']],
              ['검토', ['특권 통과', 'DLP 발견', '인용 확인']],
              ['파일링', ['버전 잠금', '감사 패킷', '기록 라벨']],
            ].map(([column, items]) => (
              <div key={column as string} className="rounded-md bg-[#f8f9ff] p-3">
                <h3 className="text-sm font-bold">{column}</h3>
                <div className="mt-3 space-y-3">
                  {(items as string[]).map((item, index) => (
                    <div key={item} className="rounded-md bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${index === 1 ? 'bg-[#ef4d86]' : 'bg-[#6b5cff]'}`} />
                        <span className="text-sm font-semibold">{item}</span>
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-[#edf0f6]">
                        <div className="h-full rounded-full bg-[#17b8d6]" style={{ width: `${44 + index * 18}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomizationSection() {
  return (
    <section id="governance" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-[32px] font-bold leading-tight tracking-normal sm:text-[42px]">
          어떤 업무 그룹에도 맞게 AMIC Vault를 구성하세요.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#667085]">
          워크스페이스 격리, 정보 장벽, 감사 정책, 기록 통제를 느슨하게 만들지 않고 업무 화면을 구성합니다.
        </p>
      </div>
      <div className="mt-12 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
        <article className="rounded-lg bg-[#ffc928] p-7 text-[#503d00]">
          <Blocks className="h-8 w-8" />
          <h3 className="mt-5 text-2xl font-bold tracking-normal">보안 Vault 앱을 조합하세요</h3>
          <p className="mt-3 text-sm leading-6 opacity-80">
            Matter 대시보드, 실사룸, 검색 큐, 거버넌스 리포트를 동일한 통제 프리미티브 위에서 구성합니다.
          </p>
          <Link
            href="/launch"
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-white px-4 text-sm font-bold text-[#503d00]"
          >
            출시 보기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </article>
        <AutomationMockup />
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {customizationCards.slice(1).map((card) => (
          <article key={card.title} className="rounded-lg border border-[#e8ebf2] bg-white p-6 shadow-[0_16px_45px_rgb(18_32_54_/_8%)]">
            <span className={`grid h-9 w-9 place-items-center rounded-md ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-5 text-xl font-bold tracking-normal">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-[#667085]">{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AutomationMockup() {
  return (
    <div className="rounded-lg border border-[#ffd95e] bg-white p-5 shadow-[0_16px_45px_rgb(18_32_54_/_8%)]">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['업로드 수신', '트리거'],
          ['권한 범위', '필수'],
          ['DLP 스캔', '대기'],
          ['검토자 배정', '자동'],
          ['감사 이벤트', '기록됨'],
          ['기록 라벨', '보류'],
        ].map(([name, state], index) => (
          <div key={name} className="flex items-center justify-between gap-3 rounded-md bg-[#fbfcff] p-3">
            <div className="flex items-center gap-3">
              <span className={`grid h-8 w-8 place-items-center rounded-md ${index % 2 ? 'bg-[#e8fbff] text-[#08748e]' : 'bg-[#f0eeff] text-[#5d47df]'}`}>
                {index + 1}
              </span>
              <span className="text-sm font-bold">{name}</span>
            </div>
            <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-[#667085] shadow-sm">{state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CollaborationSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8">
      <h2 className="text-[32px] font-bold leading-tight tracking-normal sm:text-[42px]">
        팀과 함께 로펌 안에서 안전하게 협업하세요.
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#667085]">
        Matter 책임자, 검토자, 보안 관리자, 기록팀이 하나의 공유 맥락에서 일하고 정책은 계속 강제됩니다.
      </p>
      <div className="relative mx-auto mt-12 max-w-4xl rounded-lg bg-[#39c7ef] p-6 text-left shadow-[0_18px_60px_rgb(18_32_54_/_10%)]">
        <div className="absolute -left-4 top-16 hidden h-20 w-20 rounded-full bg-white p-2 shadow-lg sm:block">
          <Avatar initials="MO" color="bg-[#2bc98f]" />
        </div>
        <div className="absolute -right-4 top-8 hidden h-20 w-20 rounded-full bg-white p-2 shadow-lg sm:block">
          <Avatar initials="SA" color="bg-[#ef4d86]" />
        </div>
        <div className="absolute -right-2 bottom-10 hidden h-20 w-20 rounded-full bg-white p-2 shadow-lg sm:block">
          <Avatar initials="KM" color="bg-[#ffb13b]" />
        </div>
        <div className="rounded-lg bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            {['Matter', '팀', '장벽', '감사', '기록'].map((item, index) => (
              <span
                key={item}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${
                  index === 0 ? 'bg-[#e8fbff] text-[#08748e]' : 'bg-[#f7f8fb] text-[#667085]'
                }`}
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mt-7 grid gap-5 md:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              {['충돌 검토', '특권 검토', '전문가 공시', '클로징 보관'].map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-md border border-[#edf0f6] p-3">
                  <span className="text-sm font-bold">{item}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${index === 1 ? 'bg-[#ef4d86]' : 'bg-[#17b8d6]'}`} />
                </div>
              ))}
            </div>
            <div className="relative min-h-64 rounded-md bg-[#f8f9ff] p-4">
              {['Matter 책임자', '검토자', '보안 관리자', '기록 담당'].map((item, index) => (
                <div
                  key={item}
                  className="absolute rounded-md bg-white px-4 py-3 text-sm font-bold shadow-sm"
                  style={{
                    left: `${10 + (index % 2) * 42}%`,
                    top: `${18 + index * 18}%`,
                  }}
                >
                  {item}
                </div>
              ))}
              <div className="absolute left-[28%] top-[34%] h-px w-[38%] bg-[#6b5cff]" />
              <div className="absolute left-[30%] top-[54%] h-px w-[42%] bg-[#17b8d6]" />
              <div className="absolute left-[20%] top-[72%] h-px w-[56%] bg-[#f2bd14]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return <div className={`grid h-full w-full place-items-center rounded-full text-lg font-bold text-white ${color}`}>{initials}</div>;
}

function DocumentSection() {
  return (
    <section className="bg-[linear-gradient(135deg,#ff5d9e,#ff73b4)] px-5 py-20 text-white sm:px-8">
      <div className="mx-auto max-w-6xl text-center">
        <h2 className="mx-auto max-w-2xl text-[32px] font-bold leading-tight tracking-normal sm:text-[42px]">
          모든 문서를 팀과 함께 라우팅하고 기록하세요.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/84">
          업로드, 버전, 레드라인, 결정, 감사 이벤트가 함께 남아 모든 파일에 방어 가능한 이력이 생깁니다.
        </p>
        <DocumentMockup />
      </div>
    </section>
  );
}

function DocumentMockup() {
  return (
    <div className="mx-auto mt-11 max-w-4xl rounded-lg bg-white p-4 text-left text-[#182232] shadow-[0_28px_80px_rgb(142_22_92_/_20%)]">
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_220px]">
        <aside className="hidden border-r border-[#edf0f6] pr-4 lg:block">
          {['버전', '코멘트', '마스킹', '감사'].map((item, index) => (
            <div key={item} className={`mb-2 rounded-md px-3 py-2 text-sm font-bold ${index === 0 ? 'bg-[#fff0f6] text-[#b91d60]' : 'text-[#667085]'}`}>
              {item}
            </div>
          ))}
        </aside>
        <article className="min-w-0 rounded-md border border-[#edf0f6] p-5">
          <p className="text-sm font-bold text-[#667085]">주식매매계약서</p>
          <h3 className="mt-3 text-2xl font-bold tracking-normal">제4.2조 공시 통제</h3>
          <p className="mt-4 leading-7 text-[#4a5567]">
            매도인은 승인된 Matter 작업공간을 통해 공시목록, 예외사항, 권한 근거를 제출해야 합니다.
          </p>
          <div className="mt-5 space-y-3">
            <span className="block h-3 w-11/12 rounded-full bg-[#f1f3f7]" />
            <span className="block h-3 w-9/12 rounded-full bg-[#f1f3f7]" />
            <span className="block h-3 w-10/12 rounded-full bg-[#f1f3f7]" />
          </div>
        </article>
        <aside className="rounded-md bg-[#fbfcff] p-4">
          <h3 className="text-sm font-bold">라우팅</h3>
          {[
            ['책임자', '승인됨'],
            ['보안', '통과'],
            ['기록', '보류'],
          ].map(([label, value]) => (
            <div key={label} className="mt-4 flex items-center justify-between text-sm">
              <span className="font-semibold">{label}</span>
              <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-[#667085] shadow-sm">{value}</span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

function ReportingSection() {
  return (
    <section id="reporting" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-[32px] font-bold leading-tight tracking-normal sm:text-[42px]">
          실시간 리포팅으로 흐름을 놓치지 마세요.
        </h2>
        <p className="mt-4 text-base leading-7 text-[#667085]">
          위험, 업무량, 게이트, 문서 운영이 차단 요인이 되기 전에 한눈에 보이게 합니다.
        </p>
      </div>
      <div className="mt-12 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-lg bg-[linear-gradient(135deg,#ff7272,#ff9f86)] p-7 text-white">
          <LayoutDashboard className="h-9 w-9" />
          <h3 className="mt-5 text-2xl font-bold tracking-normal">대시보드</h3>
          <p className="mt-3 text-sm leading-6 text-white/82">
            기술 증거와 법무 업무 상태를 리더가 빠르게 훑을 수 있는 대시보드로 전환합니다.
          </p>
        </article>
        <ReportingMockup />
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {reportingCards.slice(1).map((card) => (
          <article key={card.title} className="rounded-lg border border-[#e8ebf2] bg-white p-6 shadow-[0_16px_45px_rgb(18_32_54_/_8%)]">
            <span className={`grid h-9 w-9 place-items-center rounded-md bg-[linear-gradient(135deg,var(--tw-gradient-stops))] ${card.tint} text-white`}>
              <card.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-5 text-lg font-bold tracking-normal">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-[#667085]">{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportingMockup() {
  return (
    <div className="rounded-lg border border-[#ffb1a1] bg-white p-5 shadow-[0_16px_45px_rgb(18_32_54_/_8%)]">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md bg-[#fbfcff] p-4">
          <p className="text-xs font-bold text-[#667085]">검색 지연</p>
          <div className="mt-6 flex h-24 items-end gap-2">
            {[42, 58, 35, 76, 64, 90].map((height) => (
              <span key={height} className="w-full rounded-t bg-[#6b5cff]" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-md bg-[#fbfcff] p-4">
          <p className="text-xs font-bold text-[#667085]">게이트 상태</p>
          <div className="mt-6 space-y-3">
            {['권한', '감사', '기록', 'AI 게이트'].map((item, index) => (
              <div key={item} className="flex items-center justify-between text-sm">
                <span>{item}</span>
                <span className={index === 3 ? 'text-[#f59e0b]' : 'text-[#12a87d]'}>{index === 3 ? '관찰' : '통과'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md bg-[#fbfcff] p-4">
          <p className="text-xs font-bold text-[#667085]">감사 구성</p>
          <div className="mt-7 grid h-24 place-items-center">
            <div className="h-24 w-24 rounded-full border-[18px] border-[#17b8d6] border-r-[#f2bd14] border-t-[#ef4d86]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeSection() {
  return (
    <section className="bg-[#f8f9fc] px-5 py-20 sm:px-8">
      <div className="mx-auto max-w-6xl text-center">
        <h2 className="text-[32px] font-bold leading-tight tracking-normal sm:text-[42px]">
          감사 가능한 시간 관리.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#667085]">
          중요한 워크플로마다 담당자, 날짜, 증거, 변경 불가능한 이벤트 이력을 함께 남깁니다.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {timeCards.map((card) => (
            <article key={card.title} className="rounded-lg border border-[#e8ebf2] bg-white p-6 text-left shadow-[0_16px_45px_rgb(18_32_54_/_8%)]">
              <span className={`grid h-10 w-10 place-items-center rounded-md text-white ${card.accent}`}>
                <card.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-xl font-bold tracking-normal">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#667085]">{card.body}</p>
              <a href="#reporting" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#5d47df]">
                자세히 보기
                <ArrowRight className="h-4 w-4" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function MoreSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 text-center sm:px-8">
      <h2 className="text-[32px] font-bold leading-tight tracking-normal sm:text-[42px]">그리고 더 있습니다.</h2>
      <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#667085]">
        AMIC Vault는 매일의 법무 운영을 동일한 증거 기반 통제면에 묶어 둡니다.
      </p>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {[
          ['업무 관리', '배정', '기한', '검토 큐', '에스컬레이션'],
          ['통합 캘린더', '게이트 기간', '마이그레이션 리허설', 'Matter 마감', '기록 마일스톤'],
          ['팀 협업', '내부 코멘트', '감사 안전 메모', '역할 기반 멘션', '결정 이력'],
        ].map(([title, ...items], index) => (
          <article key={title} className="rounded-lg border border-[#e8ebf2] bg-white p-6 text-left shadow-[0_16px_45px_rgb(18_32_54_/_8%)]">
            <span className={`grid h-9 w-9 place-items-center rounded-md text-white ${index === 0 ? 'bg-[#6b5cff]' : index === 1 ? 'bg-[#17b8d6]' : 'bg-[#ef4d86]'}`}>
              {index === 0 ? <CheckCircle2 className="h-5 w-5" /> : index === 1 ? <Timer className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            </span>
            <h3 className="mt-5 text-lg font-bold tracking-normal">{title}</h3>
            <ul className="mt-4 space-y-2 text-sm text-[#667085]">
              {items.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#c4c9d4]" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <Link
        href="/dashboard"
        className="mt-10 inline-flex h-11 items-center gap-2 rounded-md bg-[#6b5cff] px-5 text-sm font-bold text-white shadow-[0_16px_35px_rgb(107_92_255_/_24%)]"
      >
        작업공간으로 이동
        <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

function ShowcaseFooter() {
  return (
    <footer className="border-t border-[#edf0f6] bg-[#fbfcff]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="rounded-lg border border-[#e8ebf2] bg-white p-5 shadow-[0_16px_45px_rgb(18_32_54_/_8%)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-normal">AMIC Vault를 로펌의 안전한 기억으로 만드세요.</h2>
              <p className="mt-2 text-sm text-[#667085]">Matter 중심, 감사 우선, 기본 권한 제한.</p>
            </div>
            <Link href="/login" className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#6b5cff] px-4 text-sm font-bold text-white">
              검토 시작
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="mt-9 grid gap-8 md:grid-cols-[1.2fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-md bg-[#eef2ff]">
                <img src="/icons/amic-vault-icon.svg" alt="" className="h-9 w-9" />
              </span>
              <img src="/icons/amic-vault-wordmark.svg" alt="AMIC Vault" className="h-[18px] w-[86px]" />
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-[#667085]">
              문서, Matter, 보안, 감사, 기록, 통제된 지식 업무를 위한 법무 데이터 OS입니다.
            </p>
          </div>
          {footerColumns.map(([heading, ...items]) => (
            <div key={heading}>
              <h3 className="text-sm font-bold tracking-normal text-[#1e2530]">{heading}</h3>
              <ul className="mt-4 space-y-2 text-sm text-[#667085]">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
