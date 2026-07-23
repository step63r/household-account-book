import type { Category } from '@household/shared';
import type { CategoryRepository } from './categoryRepository';

/**
 * In-memory CategoryRepository for unit tests. Never touches AWS - mirrors the semantics of
 * DynamoCategoryRepository closely enough to exercise service/handler logic in isolation.
 */
export class FakeCategoryRepository implements CategoryRepository {
  private readonly itemsByKey = new Map<string, Category>();

  private key(userId: string, categoryId: string): string {
    return `${userId}#${categoryId}`;
  }

  async listByUser(userId: string): Promise<Category[]> {
    return [...this.itemsByKey.values()].filter((category) => category.userId === userId);
  }

  async getById(userId: string, categoryId: string): Promise<Category | undefined> {
    return this.itemsByKey.get(this.key(userId, categoryId));
  }

  async put(category: Category): Promise<void> {
    this.itemsByKey.set(this.key(category.userId, category.id), category);
  }

  async putAll(categories: Category[]): Promise<void> {
    for (const category of categories) {
      await this.put(category);
    }
  }

  async delete(userId: string, categoryId: string): Promise<void> {
    this.itemsByKey.delete(this.key(userId, categoryId));
  }
}
