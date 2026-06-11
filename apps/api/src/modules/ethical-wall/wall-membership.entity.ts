import type {
  EthicalWallMembershipDto,
  WallMembershipType,
  WallSubjectType,
} from '@amic-vault/shared';

export interface WallMembershipEntityProps {
  membershipId: string;
  wallId: string;
  tenantId: string;
  subjectType: WallSubjectType;
  subjectId: string;
  membershipType: WallMembershipType;
  createdBy: string;
  createdAt: Date;
}

export class WallMembershipEntity {
  readonly props: WallMembershipEntityProps;

  constructor(props: WallMembershipEntityProps) {
    this.props = props;
  }

  toDto(): EthicalWallMembershipDto {
    return {
      membershipId: this.props.membershipId,
      wallId: this.props.wallId,
      tenantId: this.props.tenantId,
      subjectType: this.props.subjectType,
      subjectId: this.props.subjectId,
      membershipType: this.props.membershipType,
      createdBy: this.props.createdBy,
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}

