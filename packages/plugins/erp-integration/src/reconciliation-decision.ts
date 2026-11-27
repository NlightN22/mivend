import type { ErpReconciliationIssueType } from './entities/erp-reconciliation-issue.entity';
import { filterFor } from './reconciliation-filters';
import type { ReconciliationSummary } from './reconciliation-summary.client';

// Pure decisions extracted from ReconciliationService so they're unit-testable without a DB or a
// mocked HTTP client, mirroring retry-policy.ts's own split in this same plugin.

// Only price keeps a row locally when its unit is unresolved; other types drop a row on any missing link.
const PRODUCT_ONLY_UNRESOLVED_TYPES: readonly string[] = ['price'];

// The local row stores the raw ids without checking them, so unresolved upstream rows are all present here.
const STORES_UNRESOLVED_TYPES: readonly string[] = ['stockOrganization'];

export function resolveTheirCount(summary: ReconciliationSummary): number {
    const useActive =
        summary.activeCount != null && filterFor(summary.aggregateType).theirFigure === 'active';
    const total = useActive ? (summary.activeCount as number) : summary.count;
    if (STORES_UNRESOLVED_TYPES.includes(summary.aggregateType)) return total;
    const anyLink =
        (useActive ? summary.unresolvedActiveCount : summary.unresolvedLinkCount) ?? null;
    const byProduct = PRODUCT_ONLY_UNRESOLVED_TYPES.includes(summary.aggregateType)
        ? ((useActive ? summary.unresolvedProductActiveCount : summary.unresolvedProductCount) ??
          null)
        : null;
    if (byProduct != null && anyLink != null && byProduct > anyLink) {
        throw new Error(
            `Summary for ${summary.aggregateType} reports ${byProduct} unresolved-product rows above ${anyLink} unresolved rows`,
        );
    }
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
