import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordResetConfirmForm } from './password-reset-confirm-form';

function PasswordResetConfirmFallback() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center">
          <img
            src="/icons/amic-vault-wordmark.svg"
            alt="AMIC Vault"
            className="h-[22px] w-[106px]"
          />
        </CardTitle>
        <CardDescription>계정 활성화 화면을 준비하고 있습니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">잠시만 기다려 주세요.</p>
      </CardContent>
    </Card>
  );
}

export default function PasswordResetConfirmPage() {
  return (
    <Suspense fallback={<PasswordResetConfirmFallback />}>
      <PasswordResetConfirmForm />
    </Suspense>
  );
}
