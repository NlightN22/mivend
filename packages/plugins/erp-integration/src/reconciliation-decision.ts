import type { ErpReconciliationIssueType } from './entities/erp-reconciliation-issue.entity';
import type { ReconciliationSummary } from './reconciliation-summary.client';

// storageLocation has no active/inactive split upstream (activeCount is always null).
// Selection rule stays general, so it remains correct if the type joins COMPARED_AGGREGATE_TYPES.
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
