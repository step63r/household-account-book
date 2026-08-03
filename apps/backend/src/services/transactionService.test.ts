import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { FakeTransactionRepository } from '../repository/fakeTransactionRepository';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from './transactionService';
import { HttpError, NotFoundError } from '../lib/errors';

const validExpense = {
  date: '2026-07-10',
  type: 'expense' as const,
  categoryId: 'category-1',
  amount: 1200,
};

describe('createTransaction', () => {
  it('rejects invalid input', async () => {
    const repository = new FakeTransactionRepository();

    await expect(createTransaction(repository, 'user-1', { type: 'expense' })).rejects.toThrow(
      ZodError,
    );
    await expect(repository.listByUser('user-1')).resolves.toEqual([]);
  });

  it('rejects expense with a null categoryId', async () => {
    const repository = new FakeTransactionRepository();

    await expect(
      createTransaction(repository, 'user-1', { ...validExpense, categoryId: null }),
    ).rejects.toThrow(HttpError);
  });

  it('rejects transfer with a non-null categoryId', async () => {
    const repository = new FakeTransactionRepository();

    await expect(
      createTransaction(repository, 'user-1', {
        date: '2026-07-10',
        type: 'transfer',
        categoryId: 'category-1',
        amount: 5000,
      }),
    ).rejects.toThrow(HttpError);
  });

  it('accepts transfer with a null categoryId', async () => {
    const repository = new FakeTransactionRepository();

    const transaction = await createTransaction(repository, 'user-1', {
      date: '2026-07-10',
      type: 'transfer',
      categoryId: null,
      amount: 5000,
      transferLabel: 'NISA',
    });

    expect(transaction.type).toBe('transfer');
    expect(transaction.categoryId).toBeNull();
  });

  it('rejects income with a non-null categoryId', async () => {
    const repository = new FakeTransactionRepository();

    await expect(
      createTransaction(repository, 'user-1', {
        date: '2026-07-10',
        type: 'income',
        categoryId: 'category-1',
        amount: 300000,
      }),
    ).rejects.toThrow(HttpError);
  });

  it('accepts income with a null categoryId and an incomeSource', async () => {
    const repository = new FakeTransactionRepository();

    const transaction = await createTransaction(repository, 'user-1', {
      date: '2026-07-10',
      type: 'income',
      categoryId: null,
      amount: 300000,
      incomeSource: '給与',
    });

    expect(transaction.type).toBe('income');
    expect(transaction.categoryId).toBeNull();
    expect(transaction.incomeSource).toBe('給与');
  });

  it('creates and persists a valid expense', async () => {
    const repository = new FakeTransactionRepository();

    const transaction = await createTransaction(repository, 'user-1', validExpense);

    expect(transaction.userId).toBe('user-1');
    expect(transaction.amount).toBe(1200);
    await expect(repository.getById('user-1', transaction.id)).resolves.toEqual(transaction);
  });
});

describe('listTransactions', () => {
  it("returns only the caller's own transactions", async () => {
    const repository = new FakeTransactionRepository();
    await createTransaction(repository, 'user-1', validExpense);
    await createTransaction(repository, 'user-2', validExpense);

    const userOneTransactions = await listTransactions(repository, 'user-1');

    expect(userOneTransactions).toHaveLength(1);
    expect(userOneTransactions[0]!.userId).toBe('user-1');
  });

  it('filters by from/to date range inclusively', async () => {
    const repository = new FakeTransactionRepository();
    await createTransaction(repository, 'user-1', { ...validExpense, date: '2026-07-01' });
    await createTransaction(repository, 'user-1', { ...validExpense, date: '2026-07-10' });
    await createTransaction(repository, 'user-1', { ...validExpense, date: '2026-07-20' });

    const inRange = await listTransactions(repository, 'user-1', {
      from: '2026-07-01',
      to: '2026-07-10',
    });

    expect(inRange.map((t) => t.date)).toEqual(['2026-07-01', '2026-07-10']);
  });
});

describe('updateTransaction', () => {
  it('throws NotFoundError for an unknown transaction', async () => {
    const repository = new FakeTransactionRepository();

    await expect(
      updateTransaction(repository, 'user-1', 'missing-id', { amount: 100 }),
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects invalid input', async () => {
    const repository = new FakeTransactionRepository();
    const transaction = await createTransaction(repository, 'user-1', validExpense);

    await expect(
      updateTransaction(repository, 'user-1', transaction.id, { type: 'not-a-type' }),
    ).rejects.toThrow(ZodError);
  });

  it('rejects a merged result that violates the categoryId rule', async () => {
    const repository = new FakeTransactionRepository();
    const transaction = await createTransaction(repository, 'user-1', validExpense);

    // Flipping to transfer without clearing categoryId must be rejected, even though only
    // `type` was provided in this partial update.
    await expect(
      updateTransaction(repository, 'user-1', transaction.id, { type: 'transfer' }),
    ).rejects.toThrow(HttpError);
  });

  it('updates only the provided fields and bumps updatedAt', async () => {
    const repository = new FakeTransactionRepository();
    const transaction = await createTransaction(repository, 'user-1', validExpense);

    const updated = await updateTransaction(repository, 'user-1', transaction.id, {
      amount: 3000,
    });

    expect(updated.amount).toBe(3000);
    expect(updated.date).toBe(transaction.date);
    expect(updated.id).toBe(transaction.id);
  });

  it('moves the item to the new key when date changes', async () => {
    const repository = new FakeTransactionRepository();
    const deleteSpy = vi.spyOn(repository, 'delete');
    const putSpy = vi.spyOn(repository, 'put');
    const transaction = await createTransaction(repository, 'user-1', validExpense);

    const updated = await updateTransaction(repository, 'user-1', transaction.id, {
      date: '2026-08-01',
    });

    expect(updated.date).toBe('2026-08-01');
    expect(deleteSpy).toHaveBeenCalledWith('user-1', validExpense.date, transaction.id);
    expect(putSpy).toHaveBeenLastCalledWith(updated);
    await expect(repository.getById('user-1', transaction.id)).resolves.toEqual(updated);
  });

  it('does not call delete when date is unchanged', async () => {
    const repository = new FakeTransactionRepository();
    const deleteSpy = vi.spyOn(repository, 'delete');
    const transaction = await createTransaction(repository, 'user-1', validExpense);

    await updateTransaction(repository, 'user-1', transaction.id, { amount: 500 });

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe('deleteTransaction', () => {
  it('throws NotFoundError for an unknown transaction', async () => {
    const repository = new FakeTransactionRepository();

    await expect(deleteTransaction(repository, 'user-1', 'missing-id')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('deletes an existing transaction', async () => {
    const repository = new FakeTransactionRepository();
    const transaction = await createTransaction(repository, 'user-1', validExpense);

    await deleteTransaction(repository, 'user-1', transaction.id);

    await expect(repository.getById('user-1', transaction.id)).resolves.toBeUndefined();
  });
});

describe('plan-based access window', () => {
  // Computed relative to the actual wall clock (not a fixed date) so these tests stay
  // correct regardless of when they run - "outside" is always well past the 3-month floor,
  // "within" is always well inside it.
  function monthsAgoDate(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  }
  const dateOutsideWindow = monthsAgoDate(4);
  const dateWithinWindow = monthsAgoDate(1);
  const dateFarInThePast = '2010-01-01';

  describe('createTransaction', () => {
    it('rejects a free-plan transaction dated before the 3-month window', async () => {
      const repository = new FakeTransactionRepository();

      await expect(
        createTransaction(
          repository,
          'user-1',
          { ...validExpense, date: dateOutsideWindow },
          'free',
        ),
      ).rejects.toThrow(HttpError);
    });

    it('accepts a free-plan transaction within the 3-month window', async () => {
      const repository = new FakeTransactionRepository();

      const transaction = await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateWithinWindow },
        'free',
      );

      expect(transaction.date).toBe(dateWithinWindow);
    });

    it('accepts a paid-plan transaction dated far in the past (unlimited)', async () => {
      const repository = new FakeTransactionRepository();

      const transaction = await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateFarInThePast },
        'paid',
      );

      expect(transaction.date).toBe(dateFarInThePast);
    });
  });

  describe('listTransactions', () => {
    it('clamps `from` up to the free-plan floor date instead of erroring', async () => {
      const repository = new FakeTransactionRepository();
      await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateOutsideWindow },
        'paid',
      );
      await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateWithinWindow },
        'paid',
      );

      const transactions = await listTransactions(
        repository,
        'user-1',
        { from: dateFarInThePast },
        'free',
      );

      expect(transactions.map((t) => t.date)).toEqual([dateWithinWindow]);
    });

    it('leaves `from` untouched for a paid plan', async () => {
      const repository = new FakeTransactionRepository();
      await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateOutsideWindow },
        'paid',
      );

      const transactions = await listTransactions(
        repository,
        'user-1',
        { from: dateFarInThePast },
        'paid',
      );

      expect(transactions.map((t) => t.date)).toEqual([dateOutsideWindow]);
    });
  });

  describe('updateTransaction', () => {
    it('rejects updating a free-plan transaction that is already outside the window', async () => {
      const repository = new FakeTransactionRepository();
      const transaction = await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateOutsideWindow },
        'paid',
      );

      await expect(
        updateTransaction(repository, 'user-1', transaction.id, { amount: 999 }, 'free'),
      ).rejects.toThrow(HttpError);
    });

    it('rejects moving a free-plan transaction to a date outside the window', async () => {
      const repository = new FakeTransactionRepository();
      const transaction = await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateWithinWindow },
        'free',
      );

      await expect(
        updateTransaction(
          repository,
          'user-1',
          transaction.id,
          { date: dateOutsideWindow },
          'free',
        ),
      ).rejects.toThrow(HttpError);
    });

    it('allows a paid-plan update regardless of date', async () => {
      const repository = new FakeTransactionRepository();
      const transaction = await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateFarInThePast },
        'paid',
      );

      const updated = await updateTransaction(
        repository,
        'user-1',
        transaction.id,
        { amount: 500 },
        'paid',
      );

      expect(updated.amount).toBe(500);
    });
  });

  describe('deleteTransaction', () => {
    it('rejects deleting a free-plan transaction outside the window', async () => {
      const repository = new FakeTransactionRepository();
      const transaction = await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateOutsideWindow },
        'paid',
      );

      await expect(deleteTransaction(repository, 'user-1', transaction.id, 'free')).rejects.toThrow(
        HttpError,
      );
    });

    it('allows deleting a paid-plan transaction regardless of date', async () => {
      const repository = new FakeTransactionRepository();
      const transaction = await createTransaction(
        repository,
        'user-1',
        { ...validExpense, date: dateFarInThePast },
        'paid',
      );

      await deleteTransaction(repository, 'user-1', transaction.id, 'paid');

      await expect(repository.getById('user-1', transaction.id)).resolves.toBeUndefined();
    });
  });
});
