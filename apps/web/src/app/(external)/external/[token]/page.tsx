import { ExternalPortalClient } from './external-portal-client';

export default function ExternalPortalPage({ params }: { params: { token: string } }) {
  return <ExternalPortalClient token={params.token} />;
}
