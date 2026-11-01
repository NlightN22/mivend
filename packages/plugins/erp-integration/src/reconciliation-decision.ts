import type { ErpReconciliationIssueType } from './entities/erp-reconciliation-issue.entity';
import type { ReconciliationSummary } from './reconciliation-summary.client';

// storageLocation has no active/inactive split upstream (activeCount is always null).
// Selection rule stays general, so it remains correct if the type joins COMPARED_AGGREGATE_TYPES.
const NO_ACTIVE_CONCEPT_TYPES: readonly string[] = ['storageLocation'];

// Pure decisions extracted from ReconciliationService so they're unit-testable without a DB or a
// mocked HTTP client, mirroring retry-policy.ts's own split in this same plugin.
// Only a missing product has no local counterpart; rows lacking another link (e.g. a unit) are still stored here.
export function resolveTheirCount(summary: ReconciliationSummary): number {
    const useActive =
        summary.activeCount != null && !NO_ACTIVE_CONCEPT_TYPES.includes(summary.aggregateType);
    const total = useActive ? (summary.activeCount as number) : summary.count;
    const byProduct = useActive
        ? summary.unresolvedProductActiveCount
        : summary.unresolvedProductCount;
    const anyLink = useActive ? summary.unresolvedActiveCount : summary.unresolvedLinkCount;
    const unresolved = byProduct ?? anyLink ?? 0;
    if (unresolved > total) {
        throw new Error(
            `Summary for ${summary.aggregateType} reports ${unresolved} unresolved rows above its total ${total}`,
        );
    }
    return total - unresolved;
}

export function classifyDiscrepancy(
    ourCount: number,
    theirCount: number,
): ErpReconciliationIssueType {
    return ourCount > theirCount ? 'local-higher' : 'upstream-higher';
}
