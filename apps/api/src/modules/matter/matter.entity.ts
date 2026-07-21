import {
  buildSafeLabel,
  type MatterAccessScope,
  type MatterConfidentialityLevel,
  type MatterConflictStatus,
  type MatterDto,
} from '@amic-vault/shared';

export interface MatterEntityProps {
  accessScope: MatterAccessScope;
  matterId: string;
  tenantId: string;
  clientId: string;
  clientDisplayName: string | null;
  confidentialityLevel: MatterConfidentialityLevel;
  matterCode: string;
  matterName: string;
  matterType: string;
  status: string;
  conflictsStatus: MatterConflictStatus;
  openedAt: Date | null;
  closedAt: Date | null;
  leadLawyerId: string | null;
  leadLawyerDisplayName: string | null;
  leadLawyerDisplayEmail: string | null;
  leadPartnerId: string | null;
  leadPartnerDisplayName: string | null;
  leadPartnerDisplayEmail: string | null;
  leadAssociateId: string | null;
  leadAssociateDisplayName: string | null;
  leadAssociateDisplayEmail: string | null;
  practiceGroup: string | null;
  metadata: Record<string, string>;
  legalHold: boolean;
  ethicalWallActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MatterEntity {
  constructor(readonly props: MatterEntityProps) {}

  toDto(): MatterDto {
    return {
      accessScope: this.props.accessScope,
      matterId: this.props.matterId,
      tenantId: this.props.tenantId,
      clientId: this.props.clientId,
      clientDisplayName: this.props.clientDisplayName,
      confidentialityLevel: this.props.confidentialityLevel,
      matterCode: this.props.matterCode,
      matterName: this.props.matterName,
      displayName: this.props.matterName,
      displayCode: this.props.matterCode,
      safeLabel: buildSafeLabel(this.props.matterCode, this.props.matterName),
      canViewSensitiveRef: false,
      matterType: this.props.matterType,
      status: this.props.status,
      conflictsStatus: this.props.conflictsStatus,
      openedAt: this.props.openedAt?.toISOString() ?? null,
      closedAt: this.props.closedAt?.toISOString() ?? null,
      leadLawyerId: this.props.leadLawyerId,
      leadLawyerDisplayName: this.props.leadLawyerDisplayName,
      leadLawyerDisplayEmail: this.props.leadLawyerDisplayEmail,
      leadPartnerId: this.props.leadPartnerId,
      leadPartnerDisplayName: this.props.leadPartnerDisplayName,
      leadPartnerDisplayEmail: this.props.leadPartnerDisplayEmail,
      leadAssociateId: this.props.leadAssociateId,
      leadAssociateDisplayName: this.props.leadAssociateDisplayName,
      leadAssociateDisplayEmail: this.props.leadAssociateDisplayEmail,
      practiceGroup: this.props.practiceGroup,
      metadata: this.props.metadata,
      legalHold: this.props.legalHold,
      ethicalWallActive: this.props.ethicalWallActive,
      createdBy: this.props.createdBy,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
