import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { Subscription } from '@household/shared';
import { FakeSubscriptionRepository } from '../repository/fakeSubscriptionRepository';
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  reorderSubscriptions,
  updateSubscription,
} from './subscriptionService';
import { HttpError, NotFoundError } from '../lib/errors';

const validMonthly = {
  name: 'Netflix',
  categoryId: 'category-1',
  amount: 1980,
  frequency: 'monthly' as const,
  billingMonth: null,
  billingDay: 5,
  isActive: true,
};

const validYearly = {
  name: 'Amazonプライム',
  categoryId: 'category-1',
  amount: 5900,
  frequency: 'yearly' as const,
  billingMonth: 4,
  billingDay: 1,
  isActive: true,
};

describe('listSubscriptions', () => {
  it('returns an empty list for a household with no subscriptions', async () => {
    const repository = new FakeSubscriptionRepository();

    const subscriptions = await listSubscriptions(repository, 'user-1');

    expect(subscriptions).toEqual([]);
  });

  it('returns only the given household subscriptions', async () => {
    const repository = new FakeSubscriptionRepository();
    await createSubscription(repository, 'user-1', validMonthly);
    await createSubscription(repository, 'user-2', validMonthly);

    const subscriptions = await listSubscriptions(repository, 'user-1');

    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]!.householdId).toBe('user-1');
  });

  it('sorts by sortOrder, falling back to createdAt for legacy rows without sortOrder', async () => {
    const repository = new FakeSubscriptionRepository();
    const withOrder: Subscription = {
      id: 'with-order',
      householdId: 'user-1',
      ...validMonthly,
      sortOrder: 0,
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    };
    const legacyOlder: Subscription = {
      id: 'legacy-older',
      householdId: 'user-1',
      ...validMonthly,
      sortOrder: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const legacyNewer: Subscription = {
      id: 'legacy-newer',
      householdId: 'user-1',
      ...validMonthly,
      sortOrder: undefined,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    // Insert out of expected order to prove sorting, not insertion order, drives the result.
    await repository.put(legacyNewer);
    await repository.put(withOrder);
    await repository.put(legacyOlder);

    const subscriptions = await listSubscriptions(repository, 'user-1');

    expect(subscriptions.map((s) => s.id)).toEqual(['with-order', 'legacy-older', 'legacy-newer']);
  });

  it('falls back entirely to createdAt order when no rows have sortOrder', async () => {
    const repository = new FakeSubscriptionRepository();
    const older: Subscription = {
      id: 'older',
      householdId: 'user-1',
      ...validMonthly,
      sortOrder: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const newer: Subscription = {
      id: 'newer',
      householdId: 'user-1',
      ...validMonthly,
      sortOrder: undefined,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    await repository.put(newer);
    await repository.put(older);

    const subscriptions = await listSubscriptions(repository, 'user-1');

    expect(subscriptions.map((s) => s.id)).toEqual(['older', 'newer']);
  });
});

describe('createSubscription', () => {
  it('rejects invalid input', async () => {
    const repository = new FakeSubscriptionRepository();

    await expect(createSubscription(repository, 'user-1', { name: 'Netflix' })).rejects.toThrow(
      ZodError,
    );
    await expect(repository.listByHousehold('user-1')).resolves.toEqual([]);
  });

  it('rejects a yearly subscription with a null billingMonth', async () => {
    const repository = new FakeSubscriptionRepository();

    await expect(
      createSubscription(repository, 'user-1', {
        ...validYearly,
        billingMonth: null,
      }),
    ).rejects.toThrow(HttpError);
  });

  it('rejects a monthly subscription with a non-null billingMonth', async () => {
    const repository = new FakeSubscriptionRepository();

    await expect(
      createSubscription(repository, 'user-1', {
        ...validMonthly,
        billingMonth: 4,
      }),
    ).rejects.toThrow(HttpError);
  });

  it('creates and persists a valid monthly subscription', async () => {
    const repository = new FakeSubscriptionRepository();

    const subscription = await createSubscription(repository, 'user-1', validMonthly);

    expect(subscription.householdId).toBe('user-1');
    expect(subscription.billingMonth).toBeNull();
    await expect(repository.getById('user-1', subscription.id)).resolves.toEqual(subscription);
  });

  it('creates and persists a valid yearly subscription', async () => {
    const repository = new FakeSubscriptionRepository();

    const subscription = await createSubscription(repository, 'user-1', validYearly);

    expect(subscription.billingMonth).toBe(4);
    await expect(repository.getById('user-1', subscription.id)).resolves.toEqual(subscription);
  });

  it('assigns sortOrder based on the max existing value, not the item count, when some existing rows have sortOrder undefined (legacy data)', async () => {
    const repository = new FakeSubscriptionRepository();
    const legacyNoOrder: Subscription = {
      id: 'legacy-1',
      householdId: 'user-1',
      ...validMonthly,
      sortOrder: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const highSortOrder: Subscription = {
      id: 'high-order',
      householdId: 'user-1',
      ...validMonthly,
      sortOrder: 5,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    await repository.put(legacyNoOrder);
    await repository.put(highSortOrder);

    const created = await createSubscription(repository, 'user-1', validMonthly);

    // If this used existing.length (2), the new item would get sortOrder 2, which would sort
    // *before* highSortOrder (5) despite being created later. Using max + 1 avoids that.
    expect(created.sortOrder).toBe(6);
  });
});

describe('updateSubscription', () => {
  it('throws NotFoundError for an unknown subscription', async () => {
    const repository = new FakeSubscriptionRepository();

    await expect(
      updateSubscription(repository, 'user-1', 'missing-id', { name: 'New name' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects invalid input', async () => {
    const repository = new FakeSubscriptionRepository();
    const subscription = await createSubscription(repository, 'user-1', validMonthly);

    await expect(
      updateSubscription(repository, 'user-1', subscription.id, { frequency: 'weekly' }),
    ).rejects.toThrow(ZodError);
  });

  it('rejects a merged result that violates the billing schedule rule', async () => {
    const repository = new FakeSubscriptionRepository();
    const subscription = await createSubscription(repository, 'user-1', validMonthly);

    // Flipping to yearly without setting billingMonth must be rejected, even though only
    // `frequency` was provided in this partial update.
    await expect(
      updateSubscription(repository, 'user-1', subscription.id, { frequency: 'yearly' }),
    ).rejects.toThrow(HttpError);
  });

  it('updates only the provided fields and bumps updatedAt', async () => {
    const repository = new FakeSubscriptionRepository();
    const subscription = await createSubscription(repository, 'user-1', validMonthly);

    const updated = await updateSubscription(repository, 'user-1', subscription.id, {
      isActive: false,
    });

    expect(updated.isActive).toBe(false);
    expect(updated.name).toBe(subscription.name);
    expect(updated.id).toBe(subscription.id);
  });
});

describe('reorderSubscriptions', () => {
  it('reorders the whole household set and returns sortOrder matching orderedIds order', async () => {
    const repository = new FakeSubscriptionRepository();
    const a = await createSubscription(repository, 'user-1', validMonthly);
    const b = await createSubscription(repository, 'user-1', validYearly);
    const c = await createSubscription(repository, 'user-1', validMonthly);

    const result = await reorderSubscriptions(repository, 'user-1', {
      orderedIds: [c.id, a.id, b.id],
    });

    expect(result.map((s) => s.id)).toEqual([c.id, a.id, b.id]);
    expect(result.map((s) => s.sortOrder)).toEqual([0, 1, 2]);

    const persisted = await repository.listByHousehold('user-1');
    expect(persisted.find((s) => s.id === c.id)?.sortOrder).toBe(0);
    expect(persisted.find((s) => s.id === a.id)?.sortOrder).toBe(1);
    expect(persisted.find((s) => s.id === b.id)?.sortOrder).toBe(2);
  });

  it('rejects when orderedIds is missing an existing id', async () => {
    const repository = new FakeSubscriptionRepository();
    const a = await createSubscription(repository, 'user-1', validMonthly);
    await createSubscription(repository, 'user-1', validYearly);

    await expect(
      reorderSubscriptions(repository, 'user-1', { orderedIds: [a.id] }),
    ).rejects.toThrow(HttpError);
  });

  it('rejects when orderedIds contains a foreign/extra id', async () => {
    const repository = new FakeSubscriptionRepository();
    const a = await createSubscription(repository, 'user-1', validMonthly);
    const b = await createSubscription(repository, 'user-1', validYearly);

    await expect(
      reorderSubscriptions(repository, 'user-1', {
        orderedIds: [a.id, b.id, 'unknown-id'],
      }),
    ).rejects.toThrow(HttpError);
  });

  it('rejects when orderedIds contains a duplicate id', async () => {
    const repository = new FakeSubscriptionRepository();
    const a = await createSubscription(repository, 'user-1', validMonthly);
    const b = await createSubscription(repository, 'user-1', validYearly);

    await expect(
      reorderSubscriptions(repository, 'user-1', {
        orderedIds: [a.id, a.id, b.id],
      }),
    ).rejects.toThrow(HttpError);
  });
});

describe('deleteSubscription', () => {
  it('throws NotFoundError for an unknown subscription', async () => {
    const repository = new FakeSubscriptionRepository();

    await expect(deleteSubscription(repository, 'user-1', 'missing-id')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('deletes an existing subscription', async () => {
    const repository = new FakeSubscriptionRepository();
    const subscription = await createSubscription(repository, 'user-1', validMonthly);

    await deleteSubscription(repository, 'user-1', subscription.id);

    await expect(repository.getById('user-1', subscription.id)).resolves.toBeUndefined();
  });
});
