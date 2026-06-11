import type { PartyDto, PartyRole, PartyType, TenantId } from '@amic-vault/shared';

export interface PartyEntityProps {
  partyId: string;
  tenantId: TenantId;
  matterId: string;
  name: string;
  partyType: PartyType;
  partyRole: PartyRole;
  relatedClientId: string | null;
  isRestricted: boolean;
  createdBy: string;
  createdAt: Date;
}

export class PartyEntity {
  constructor(readonly props: PartyEntityProps) {}

  toDto(): PartyDto {
    return {
      partyId: this.props.partyId,
      tenantId: this.props.tenantId,
      matterId: this.props.matterId,
      name: this.props.name,
      partyType: this.props.partyType,
      partyRole: this.props.partyRole,
      relatedClientId: this.props.relatedClientId,
      isRestricted: this.props.isRestricted,
      createdBy: this.props.createdBy,
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}
