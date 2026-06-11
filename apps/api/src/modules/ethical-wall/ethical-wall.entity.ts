import type { EthicalWallDto, EthicalWallStatus } from '@amic-vault/shared';

export interface EthicalWallEntityProps {
  wallId: string;
  tenantId: string;
  matterId: string;
  wallName: string;
  reason: string;
  status: EthicalWallStatus;
  createdBy: string;
  createdAt: Date;
  releasedBy: string | null;
  releasedAt: Date | null;
}

export class EthicalWallEntity {
  readonly props: EthicalWallEntityProps;

  constructor(props: EthicalWallEntityProps) {
    this.props = props;
  }

  toDto(): EthicalWallDto {
    return {
      wallId: this.props.wallId,
      tenantId: this.props.tenantId,
      matterId: this.props.matterId,
      wallName: this.props.wallName,
      status: this.props.status,
      createdBy: this.props.createdBy,
      createdAt: this.props.createdAt.toISOString(),
      releasedBy: this.props.releasedBy,
      releasedAt: this.props.releasedAt?.toISOString() ?? null,
    };
  }
}

