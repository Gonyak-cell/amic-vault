import { Injectable } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';

export interface PasswordResetMessage {
  tenantId: TenantId;
  userId: string;
  email: string;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class MailerStub {
  private readonly messages: PasswordResetMessage[] = [];

  async sendPasswordReset(message: PasswordResetMessage): Promise<void> {
    this.messages.push(message);
  }

  latestForEmail(email: string): PasswordResetMessage | undefined {
    return [...this.messages].reverse().find((message) => message.email === email);
  }

  sentMessages(): PasswordResetMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages.splice(0, this.messages.length);
  }
}
