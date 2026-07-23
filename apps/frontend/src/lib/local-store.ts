/**
 * ローカル（localStorage）データストア。
 *
 * バックエンド API が未実装の Transactions/Budgets の CRUD をブラウザ内で完結させるための
 * 暫定実装。スキーマは `@household/shared` の型・Zod スキーマをそのまま利用する。
 *
 * Categories は apps/backend に実装済みのため、`CategoriesPage.tsx` など各ページは
 * `src/lib/categories.ts`（`apiFetch` 経由で実 API を叩く）を使う。ここに残っている
 * Categories 関連の関数（`getCategories` 等）は、この localStorage 内で Transactions/Budgets
 * のシードデータを生成する際に使う内部依存としてのみ残している（実 API の費目データとは
 * 別物になる点に注意）。
 *
 * TODO(backend): API Gateway + Lambda の Transactions/Budgets エンドポイントが用意でき次第、
 * この実装は `src/lib/api.ts` の `apiFetch` を使った呼び出しに差し替える。
 * 呼び出し側（TanStack Query の queryFn/mutationFn）のシグネチャは維持できるように
 * 関数単位で分けてある。
 */
import type {
  Budget,
  Category,
  CreateCategoryInput,
  CreateTransactionInput,
  Transaction,
  UpdateCategoryInput,
  UpdateTransactionInput,
  UpsertBudgetInput,
} from '@household/shared';
import { PRESET_CATEGORIES } from '@household/shared';

const LOCAL_USER_ID = 'local-demo-user';

const STORAGE_KEYS = {
  categories: 'household.categories.v1',
  transactions: 'household.transactions.v1',
  budgets: 'household.budgets.v1',
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

function readList<T>(key: string): T[] | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return null;
  }
}

function writeList<T>(key: string, list: T[]): void {
  localStorage.setItem(key, JSON.stringify(list));
}

function seedCategories(): Category[] {
  const seeded = PRESET_CATEGORIES.map((preset, index) => {
    const category: Category = {
      id: crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      name: preset.name,
      type: preset.type,
      tooltip: preset.tooltip,
      isPreset: true,
      sortOrder: index,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return category;
  });
  writeList(STORAGE_KEYS.categories, seeded);
  return seeded;
}

export function getCategories(): Category[] {
  return readList<Category>(STORAGE_KEYS.categories) ?? seedCategories();
}

export function createCategory(input: CreateCategoryInput): Category {
  const categories = getCategories();
  const category: Category = {
    id: crypto.randomUUID(),
    userId: LOCAL_USER_ID,
    name: input.name,
    type: input.type,
    tooltip: input.tooltip,
    isPreset: false,
    sortOrder: categories.length,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  writeList(STORAGE_KEYS.categories, [...categories, category]);
  return category;
}

export function updateCategory(id: string, input: UpdateCategoryInput): Category {
  const categories = getCategories();
  let updated: Category | undefined;
  const next = categories.map((c) => {
    if (c.id !== id) return c;
    updated = { ...c, ...input, updatedAt: nowIso() };
    return updated;
  });
  if (!updated) throw new Error(`category not found: ${id}`);
  writeList(STORAGE_KEYS.categories, next);
  return updated;
}

export function deleteCategory(id: string): void {
  const categories = getCategories();
  writeList(
    STORAGE_KEYS.categories,
    categories.filter((c) => c.id !== id),
  );
}

function randomPastDate(daysAgoMax: number): string {
  const daysAgo = Math.floor(Math.random() * daysAgoMax);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function seedTransactions(): Transaction[] {
  const expenseCategories = getCategories();

  const sample: Transaction[] = [];
  // 過去90日分のサンプル支出・収入・振替を生成する（デモ用シードデータ）
  for (let i = 0; i < 24; i += 1) {
    const category = expenseCategories[i % expenseCategories.length];
    sample.push({
      id: crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      date: randomPastDate(90),
      type: 'expense',
      categoryId: category?.id ?? null,
      amount: 1000 + Math.floor(Math.random() * 15000),
      memo: undefined,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  for (let i = 0; i < 3; i += 1) {
    sample.push({
      id: crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      date: randomPastDate(90),
      type: 'income',
      categoryId: null,
      amount: 280000 + Math.floor(Math.random() * 20000),
      memo: '給与',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  for (let i = 0; i < 3; i += 1) {
    sample.push({
      id: crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      date: randomPastDate(90),
      type: 'transfer',
      categoryId: null,
      amount: 30000 + Math.floor(Math.random() * 20000),
      memo: undefined,
      transferLabel: i % 2 === 0 ? 'つみたてNISA' : '財形貯蓄',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  writeList(STORAGE_KEYS.transactions, sample);
  return sample;
}

export function getTransactions(): Transaction[] {
  return readList<Transaction>(STORAGE_KEYS.transactions) ?? seedTransactions();
}

export function createTransaction(input: CreateTransactionInput): Transaction {
  const transactions = getTransactions();
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    userId: LOCAL_USER_ID,
    date: input.date,
    type: input.type,
    categoryId: input.categoryId,
    amount: input.amount,
    memo: input.memo,
    transferLabel: input.transferLabel,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  writeList(STORAGE_KEYS.transactions, [transaction, ...transactions]);
  return transaction;
}

export function updateTransaction(id: string, input: UpdateTransactionInput): Transaction {
  const transactions = getTransactions();
  let updated: Transaction | undefined;
  const next = transactions.map((t) => {
    if (t.id !== id) return t;
    updated = { ...t, ...input, updatedAt: nowIso() };
    return updated;
  });
  if (!updated) throw new Error(`transaction not found: ${id}`);
  writeList(STORAGE_KEYS.transactions, next);
  return updated;
}

export function deleteTransaction(id: string): void {
  const transactions = getTransactions();
  writeList(
    STORAGE_KEYS.transactions,
    transactions.filter((t) => t.id !== id),
  );
}

function seedBudgets(): Budget[] {
  const categories = getCategories().filter((c) => c.type === 'fixed' || c.type === 'variable');
  const yearMonth = nowIso().slice(0, 7);
  const budgets: Budget[] = categories.slice(0, 8).map((c) => ({
    id: crypto.randomUUID(),
    userId: LOCAL_USER_ID,
    yearMonth,
    categoryId: c.id,
    amount: c.type === 'fixed' ? 20000 + Math.floor(Math.random() * 30000) : 10000 + Math.floor(Math.random() * 20000),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));
  writeList(STORAGE_KEYS.budgets, budgets);
  return budgets;
}

export function getBudgets(): Budget[] {
  return readList<Budget>(STORAGE_KEYS.budgets) ?? seedBudgets();
}

export function upsertBudget(input: UpsertBudgetInput): Budget {
  const budgets = getBudgets();
  const existingIndex = budgets.findIndex(
    (b) => b.yearMonth === input.yearMonth && b.categoryId === input.categoryId,
  );
  if (existingIndex >= 0) {
    const existing = budgets[existingIndex];
    if (!existing) throw new Error('unreachable');
    const updated: Budget = { ...existing, amount: input.amount, updatedAt: nowIso() };
    const next = [...budgets];
    next[existingIndex] = updated;
    writeList(STORAGE_KEYS.budgets, next);
    return updated;
  }
  const created: Budget = {
    id: crypto.randomUUID(),
    userId: LOCAL_USER_ID,
    yearMonth: input.yearMonth,
    categoryId: input.categoryId,
    amount: input.amount,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  writeList(STORAGE_KEYS.budgets, [...budgets, created]);
  return created;
}
