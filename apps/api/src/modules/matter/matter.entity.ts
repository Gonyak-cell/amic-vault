import type { MatterDto } from '@amic-vault/shared';

export interface MatterEntityProps {
  matterId: string;
  tenantId: string;
  clientId: string;
  matterCode: string;
  matterName: string;
  matterType: string;
  status: string;
  openedAt: Date | null;
  closedAt: Date | null;
  leadLawyerId: string | null;
  practiceGroup: string | null;
  metadata: Record<string, string>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MatterEntity {
  constructor(readonly props: MatterEntityProps) {}

  toDto(): MatterDto {
    return {
      matterId: this.props.matterId,
      tenantId: this.props.tenantId,
      clientId: this.props.clientId,
      matterCode: this.props.matterCode,
      matterName: this.props.matterName,
      matterType: this.props.matterType,
      status: this.props.status,
      openedAt: this.props.openedAt?.toISOString() ?? null,
      closedAt: this.props.closedAt?.toISOString() ?? null,
      leadLawyerId: this.props.leadLawyerId,
      practiceGroup: this.props.practiceGroup,
      metadata: this.props.metadata,
      createdBy: this.props.createdBy,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
