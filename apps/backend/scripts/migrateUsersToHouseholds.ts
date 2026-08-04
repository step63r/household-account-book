/**
 * One-off migration script (see the plan file's "既存本番データの移行" section) - NOT a
 * deployed Lambda. Run it locally with the operator's own AWS credentials, the same way
 * `cdk deploy` is run manually today (never wired into CI).
 *
 * Usage:
 *   TABLE_NAME=<table> npx tsx apps/backend/scripts/migrateUsersToHouseholds.ts [--execute] [--user-id=<id>]
 *
 * Flags:
 *   (default)      dry run - logs what would happen, writes nothing.
 *   --execute      actually performs the migration.
 *   --user-id=<id> restricts the run to exactly one user (e.g. a canary run on the operator's
 *                  own account before running against everyone). Bypasses the Scan entirely.
 *
 * Requires the `TABLE_NAME` env var (same var the deployed Lambdas read via
 * `repository/dynamoClient.ts#getTableName()`) pointing at the real DynamoDB table, and AWS
 * credentials with Scan/Query/PutItem/BatchWriteItem on that table (e.g. via `AWS_PROFILE`).
 *
 * Safe to re-run in full at any time - see migrateUsersToHouseholds.ts's module doc comment
 * for the idempotency argument. Recommended flow: `--dry-run` (default) to review the log,
 * then `--user-id=<your own userId>` + `--execute` as a canary, then a full `--execute`.
 */
import { DynamoMigrationRepository } from '../src/repository/migrationRepository';
import { runMigration, type MigrationResult } from '../src/migration/migrateUsersToHouseholds';

function parseArgs(argv: string[]): { dryRun: boolean; userId?: string } {
  const execute = argv.includes('--execute');
  const userIdArg = argv.find((arg) => arg.startsWith('--user-id='));
  const userId = userIdArg ? userIdArg.slice('--user-id='.length) : undefined;
  return { dryRun: !execute, userId };
}

function summarize(results: MigrationResult[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const result of results) {
    summary[result.status] = (summary[result.status] ?? 0) + 1;
  }
  return summary;
}

async function main(): Promise<void> {
  const { dryRun, userId } = parseArgs(process.argv.slice(2));

  console.log(
    `[migrate] starting ${dryRun ? 'DRY RUN (default - pass --execute to write)' : 'EXECUTE'}` +
      (userId ? ` restricted to --user-id=${userId}` : ' against every unmigrated user (Scan)'),
  );

  const repository = new DynamoMigrationRepository();
  const results = await runMigration(repository, { dryRun, userId });

  console.log('[migrate] ---- summary ----');
  console.log(`[migrate] total candidates processed: ${results.length}`);
  console.log(`[migrate] status breakdown: ${JSON.stringify(summarize(results))}`);

  const cleanupFailures = results.filter((result) => result.cleanupFailed);
  if (cleanupFailures.length > 0) {
    console.warn(
      `[migrate] ${cleanupFailures.length} user(s) had a cleanup-phase failure - the migration ` +
        'itself already committed successfully for these, old items were just left behind as ' +
        `harmless orphans: ${cleanupFailures.map((result) => result.userId).join(', ')}`,
    );
  }

  const missingProfiles = results.filter((result) => result.status === 'missingProfile');
  if (missingProfiles.length > 0) {
    console.warn(
      `[migrate] ${missingProfiles.length} candidate(s) had no PROFILE item at all (unexpected - ` +
        `investigate before re-running): ${missingProfiles.map((result) => result.userId).join(', ')}`,
    );
  }

  if (dryRun) {
    console.log(
      '[migrate] this was a dry run - no data was written. Re-run with --execute to migrate for real.',
    );
  }
}

main().catch((error) => {
  console.error('[migrate] fatal error - aborting', error);
  process.exitCode = 1;
});
