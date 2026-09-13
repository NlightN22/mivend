import type { ErpReconciliationIssueType } from './entities/erp-reconciliation-issue.entity';
import type { ReconciliationSummary } from './reconciliation-summary.client';

// storageLocation is the one aggregate type with no active/inactive concept upstream at all
// (activeCount always null there, per Step 0's own contract) — not currently in
// COMPARED_AGGREGATE_TYPES (reconciliation-local-counts.service.ts has no local count for it at
// all), but this selection rule is kept general/correct regardless of which types are wired up.
const NO_ACTIVE_CONCEPT_TYPES: readonly string[] = ['storageLocation'];

// Pure decisions extracted from ReconciliationService so they're unit-testable without a DB or a
// mocked HTTP client, mirroring retry-policy.ts's own split in this same plugin.
export function resolveTheirCount(summary: ReconciliationSummary): number {
    if (NO_ACTIVE_CONCEPT_TYPES.includes(summary.aggregateType)) return summary.count;
    return summary.activeCount ?? summary.count;
}

export function classifyDiscrepancy(
    ourCount: number,
    theirCount: number,
): ErpReconciliationIssueType {
    return ourCount > theirCount ? 'local-higher' : 'upstream-higher';
}
