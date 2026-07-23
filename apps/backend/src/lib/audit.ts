/**
 * Every mutating endpoint (create/update/delete transaction, category, budget, account)
 * must emit an audit log line to CloudWatch Logs identifying who changed what
 * (see repo root CLAUDE.md, "監査ログ"). CloudWatch Logs captures Lambda stdout, so a
 * structured console.log is sufficient - no separate audit sink today.
 */
export interface AuditLogEntry {
  userId: string;
  action: string;
  targetId: string;
  details?: Record<string, unknown>;
}

export function logAudit(entry: AuditLogEntry): void {
  console.log(
    JSON.stringify({
      type: 'AUDIT',
      timestamp: new Date().toISOString(),
      ...entry,
    }),
  );
}
