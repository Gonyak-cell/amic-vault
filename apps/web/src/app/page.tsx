import { ERROR_CODES } from '@amic-vault/shared';

export default function HomePage() {
  return (
    <main style={{ margin: '0 auto', maxWidth: 960, padding: 32 }}>
      <h1>AMIC Vault</h1>
      <p>R0 foundation shell is ready for PACK-driven implementation.</p>
      <p>Standard error codes loaded: {ERROR_CODES.length}</p>
    </main>
  );
}
