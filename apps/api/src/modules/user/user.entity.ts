import type { TenantId, UserStatus, UserSummary } from '@amic-vault/shared';

export interface UserEntityProps {
  userId: string;
  tenantId: TenantId;
  email: string;
  name: string;
  role: string;
  practiceGroup: string | null;
  status: UserStatus;
  passwordHash: string;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserEntity {
  readonly userId: string;
  readonly tenantId: TenantId;
  readonly email: string;
  readonly name: string;
  readonly role: string;
  readonly practiceGroup: string | null;
  readonly status: UserStatus;
  readonly passwordHash: string;
  readonly mfaEnabled: boolean;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: UserEntityProps) {
    this.userId = props.userId;
    this.tenantId = props.tenantId;
    this.email = props.email;
    this.name = props.name;
    this.role = props.role;
    this.practiceGroup = props.practiceGroup;
    this.status = props.status;
    this.passwordHash = props.passwordHash;
    this.mfaEnabled = props.mfaEnabled;
    this.lastLoginAt = props.lastLoginAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  toSummary(): UserSummary {
    return {
      userId: this.userId,
      tenantId: this.tenantId,
      email: this.email,
      name: this.name,
      // Role remains a free string in R0; the R1 SEC-RBAC pack owns the enum matrix.
      role: this.role,
      practiceGroup: this.practiceGroup,
      status: this.status,
      mfaEnabled: this.mfaEnabled,
      lastLoginAt: this.lastLoginAt?.toISOString() ?? null,
    };
  }

  toJSON(): UserSummary {
    return this.toSummary();
  }
}
