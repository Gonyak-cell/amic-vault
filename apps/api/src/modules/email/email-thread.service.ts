import { Injectable } from '@nestjs/common';

export interface EmailThreadEnvelope {
  emailId: string;
  messageIdHash: string;
  referenceHashes?: readonly string[];
  conversationIdHash?: string | null;
}

export interface EmailThreadAssignment {
  emailId: string;
  messageIdHash: string;
  threadKey: string;
  rootMessageHash: string;
  conversationIdHash: string | null;
  memberEmailIds: readonly string[];
  relatedEmailCount: number;
}

class ThreadUnion {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();
  private readonly firstSeen = new Map<string, number>();
  private nextSeen = 0;

  add(node: string): void {
    if (this.parent.has(node)) return;
    this.parent.set(node, node);
    this.rank.set(node, 0);
    this.firstSeen.set(node, this.nextSeen);
    this.nextSeen += 1;
  }

  find(node: string): string {
    this.add(node);
    const parent = this.parent.get(node);
    if (!parent || parent === node) return node;
    const root = this.find(parent);
    this.parent.set(node, root);
    return root;
  }

  union(left: string, right: string): string {
    let leftRoot = this.find(left);
    let rightRoot = this.find(right);
    if (leftRoot === rightRoot) return leftRoot;

    const leftRank = this.rank.get(leftRoot) ?? 0;
    const rightRank = this.rank.get(rightRoot) ?? 0;
    if (leftRank < rightRank) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    if (leftRank === rightRank && this.seenOrder(rightRoot) < this.seenOrder(leftRoot)) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    this.parent.set(rightRoot, leftRoot);
    if (leftRank === rightRank) this.rank.set(leftRoot, leftRank + 1);
    return leftRoot;
  }

  seenOrder(node: string): number {
    return this.firstSeen.get(node) ?? Number.MAX_SAFE_INTEGER;
  }
}

function uniqueHashes(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function conversationNode(conversationIdHash: string): string {
  return `conversation:${conversationIdHash}`;
}

@Injectable()
export class EmailThreadService {
  assignThreads(envelopes: readonly EmailThreadEnvelope[]): EmailThreadAssignment[] {
    const union = new ThreadUnion();
    for (const envelope of envelopes) {
      const referenceHashes = uniqueHashes(envelope.referenceHashes);
      for (const referenceHash of referenceHashes) union.add(referenceHash);
      union.add(envelope.messageIdHash);
      for (const referenceHash of referenceHashes) union.union(envelope.messageIdHash, referenceHash);
      if (envelope.conversationIdHash) {
        const node = conversationNode(envelope.conversationIdHash);
        union.add(node);
        union.union(envelope.messageIdHash, node);
      }
    }

    const grouped = new Map<string, EmailThreadEnvelope[]>();
    for (const envelope of envelopes) {
      const root = union.find(envelope.messageIdHash);
      grouped.set(root, [...(grouped.get(root) ?? []), envelope]);
    }

    return envelopes.map((envelope) => {
      const root = union.find(envelope.messageIdHash);
      const members = grouped.get(root) ?? [envelope];
      const conversationIdHash =
        members.find((member) => member.conversationIdHash)?.conversationIdHash ?? null;
      const rootMessageHash = this.rootMessageHash(union, members);
      return {
        emailId: envelope.emailId,
        messageIdHash: envelope.messageIdHash,
        threadKey: `message:${rootMessageHash}`,
        rootMessageHash,
        conversationIdHash,
        memberEmailIds: members.map((member) => member.emailId),
        relatedEmailCount: Math.max(0, members.length - 1),
      };
    });
  }

  private rootMessageHash(union: ThreadUnion, members: readonly EmailThreadEnvelope[]): string {
    const candidates = members.flatMap((member) => [
      ...uniqueHashes(member.referenceHashes),
      member.messageIdHash,
    ]);
    return candidates.sort((left, right) => union.seenOrder(left) - union.seenOrder(right))[0] ?? '';
  }
}
