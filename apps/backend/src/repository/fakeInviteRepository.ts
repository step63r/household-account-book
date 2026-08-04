import type { Invite } from '@household/shared';
import type { InviteRepository } from './inviteRepository';

/**
 * In-memory InviteRepository for unit tests. Never touches AWS - mirrors the semantics of
 * DynamoInviteRepository closely enough to exercise service/handler logic in isolation.
 */
export class FakeInviteRepository implements InviteRepository {
  private readonly invitesByToken = new Map<string, Invite>();

  async get(token: string): Promise<Invite | undefined> {
    return this.invitesByToken.get(token);
  }

  async put(invite: Invite): Promise<void> {
    this.invitesByToken.set(invite.token, invite);
  }

  async delete(token: string): Promise<void> {
    this.invitesByToken.delete(token);
  }
}
