import type {
  MatterMemberAccessLevel,
  MatterMemberDto,
  MatterMemberRole,
} from '@amic-vault/shared';

export interface MatterMemberEntityProps {
  matterId: string;
  tenantId: string;
  userId: string;
  matterRole: MatterMemberRole;
  accessLevel: MatterMemberAccessLevel;
  addedBy: string;
  addedAt: Date;
}

export class MatterMemberEntity {
  readonly props: MatterMemberEntityProps;

  constructor(props: MatterMemberEntityProps) {
    this.props = props;
  }

  toDto(): MatterMemberDto {
    return {
      matterId: this.props.matterId,
      tenantId: this.props.tenantId,
      userId: this.props.userId,
      matterRole: this.props.matterRole,
      accessLevel: this.props.accessLevel,
      addedBy: this.props.addedBy,
      addedAt: this.props.addedAt.toISOString(),
    };
  }
}

