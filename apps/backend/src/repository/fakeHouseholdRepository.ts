import type { Household, HouseholdMember } from '@household/shared';
import type { HouseholdRepository } from './householdRepository';

/**
 * In-memory HouseholdRepository for unit tests. Never touches AWS - mirrors the semantics of
 * DynamoHouseholdRepository closely enough to exercise service/handler logic in isolation.
 *
 * `isFresh` can't be derived from this fake's own state (TXN#/BUDGET# items live in the
 * separate Fake{Transaction,Budget}Repository stores, not here) - tests that need a non-fresh
 * household should call `markNotFresh(householdId)` explicitly, mirroring what a real
 * household with existing transactions/budgets would report.
 */
export class FakeHouseholdRepository implements HouseholdRepository {
  private readonly profilesByHouseholdId = new Map<string, Household>();
  private readonly membersByHouseholdId = new Map<string, Map<string, HouseholdMember>>();
  private readonly notFreshHouseholdIds = new Set<string>();

  /** Test hook: marks a household as having existing TXN#/BUDGET# data (isFresh() -> false). */
  markNotFresh(householdId: string): void {
    this.notFreshHouseholdIds.add(householdId);
  }

  async getProfile(householdId: string): Promise<Household | undefined> {
    return this.profilesByHouseholdId.get(householdId);
  }

  async putProfile(household: Household): Promise<void> {
    this.profilesByHouseholdId.set(household.id, household);
  }

  async listMembers(householdId: string): Promise<HouseholdMember[]> {
    return [...(this.membersByHouseholdId.get(householdId)?.values() ?? [])];
  }

  async putMember(member: HouseholdMember): Promise<void> {
    const members = this.membersByHouseholdId.get(member.householdId) ?? new Map();
    members.set(member.userId, member);
    this.membersByHouseholdId.set(member.householdId, members);
  }

  async deleteMember(householdId: string, userId: string): Promise<void> {
    this.membersByHouseholdId.get(householdId)?.delete(userId);
  }

  async isFresh(householdId: string): Promise<boolean> {
    return !this.notFreshHouseholdIds.has(householdId);
  }

  async deleteAllItems(householdId: string): Promise<number> {
    const memberCount = this.membersByHouseholdId.get(householdId)?.size ?? 0;
    const profileCount = this.profilesByHouseholdId.has(householdId) ? 1 : 0;
    this.profilesByHouseholdId.delete(householdId);
    this.membersByHouseholdId.delete(householdId);
    this.notFreshHouseholdIds.delete(householdId);
    return memberCount + profileCount;
  }
}
