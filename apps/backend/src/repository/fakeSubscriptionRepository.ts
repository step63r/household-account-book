import type { Subscription } from '@household/shared';
import type { SubscriptionRepository } from './subscriptionRepository';

/**
 * In-memory SubscriptionRepository for unit tests. Never touches AWS - mirrors the semantics of
 * DynamoSubscriptionRepository closely enough to exercise service/handler logic in isolation.
 */
export class FakeSubscriptionRepository implements SubscriptionRepository {
  private readonly itemsByKey = new Map<string, Subscription>();

  private key(householdId: string, subscriptionId: string): string {
    return `${householdId}#${subscriptionId}`;
  }

  async listByHousehold(householdId: string): Promise<Subscription[]> {
    return [...this.itemsByKey.values()].filter(
      (subscription) => subscription.householdId === householdId,
    );
  }

  async getById(householdId: string, subscriptionId: string): Promise<Subscription | undefined> {
    return this.itemsByKey.get(this.key(householdId, subscriptionId));
  }

  async put(subscription: Subscription): Promise<void> {
    this.itemsByKey.set(this.key(subscription.householdId, subscription.id), subscription);
  }

  async delete(householdId: string, subscriptionId: string): Promise<void> {
    this.itemsByKey.delete(this.key(householdId, subscriptionId));
  }
}
