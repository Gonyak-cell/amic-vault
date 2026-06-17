import type {
  ClientConfidentialityLevel,
  ClientDto,
  ClientStatus,
  ClientType,
} from '@amic-vault/shared';
import { buildSafeLabel } from '@amic-vault/shared';

export interface ClientEntityProps {
  clientId: string;
  tenantId: string;
  name: string;
  clientType: ClientType;
  confidentialityLevel: ClientConfidentialityLevel;
  status: ClientStatus;
  metadata: Record<string, string>;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ClientEntity {
  constructor(readonly props: ClientEntityProps) {}

  toDto(): ClientDto {
    return {
      clientId: this.props.clientId,
      tenantId: this.props.tenantId,
      name: this.props.name,
      displayName: this.props.name,
      safeLabel: buildSafeLabel(this.props.name),
      canViewSensitiveRef: false,
      clientType: this.props.clientType,
      confidentialityLevel: this.props.confidentialityLevel,
      status: this.props.status,
      metadata: this.props.metadata,
      createdBy: this.props.createdBy,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
