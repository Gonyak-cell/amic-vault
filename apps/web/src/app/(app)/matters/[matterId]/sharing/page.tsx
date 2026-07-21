import { ExternalSharingClient } from './sharing-client';

export default function MatterSharingPage({ params }: { params: { matterId: string } }) {
  return <ExternalSharingClient matterId={params.matterId} />;
}
