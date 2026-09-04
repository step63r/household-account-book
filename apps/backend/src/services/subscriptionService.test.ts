import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { FakeSubscriptionRepository } from '../repository/fakeSubscriptionRepository';
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
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
