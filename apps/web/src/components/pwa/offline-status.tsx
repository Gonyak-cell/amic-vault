'use client';

export function OfflineStatus({ offline }: { offline: boolean }) {
  if (!offline) return null;

  return (
    <div className="pwa-offline-status" role="status" aria-live="polite">
      <strong>AMIC Vault 연결 대기 중</strong>
      <span>네트워크 연결이 복구되면 계속 진행할 수 있습니다.</span>
    </div>
  );
}
