import type { User } from '@household/shared';
import type { UserRepository } from './userRepository';

/**
 * In-memory UserRepository for unit tests. Never touches AWS - mirrors the semantics of
 * DynamoUserRepository closely enough to exercise service/handler logic in isolation.
 */
export class FakeUserRepository implements UserRepository {
  private readonly profilesByUserId = new Map<string, User>();

  async getProfile(userId: string): Promise<User | undefined> {
    return this.profilesByUserId.get(userId);
  }

  async put(user: User): Promise<void> {
    this.profilesByUserId.set(user.id, user);
  }
}
