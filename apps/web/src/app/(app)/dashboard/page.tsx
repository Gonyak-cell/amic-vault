import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          R0 shell은 인증 상태와 기본 운영 화면만 제공합니다.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Tenant Session</CardTitle>
            <CardDescription>세션 쿠키 기반 접근</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm">
              상태 보기
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Audit Baseline</CardTitle>
            <CardDescription>append-only DB 기반</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">R1에서 audit logger와 연결됩니다.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>R2 이후 활성화</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">AI, 검색, 외부 공유 기능은 아직 없습니다.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
