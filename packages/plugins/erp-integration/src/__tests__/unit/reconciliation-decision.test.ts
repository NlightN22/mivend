import { describe, expect, it } from 'vitest';

import { classifyDiscrepancy, resolveTheirCount } from '../../reconciliation-decision';
import type { ReconciliationSummary } from '../../reconciliation-summary.client';

function summary(overrides: Partial<ReconciliationSummary>): ReconciliationSummary {
    return {
        aggregateType: 'product',
        count: 10,
        activeCount: 8,
        lastModifiedMax: null,
        ...overrides,
    };
}

describe('resolveTheirCount', () => {
    it('uses activeCount for a normal aggregate type', () => {
        expect(resolveTheirCount(summary({ activeCount: 8, count: 10 }))).toBe(8);
    });

    it('uses activeCount even when it is genuinely 0, not falling back to count', () => {
        expect(resolveTheirCount(summary({ activeCount: 0, count: 10 }))).toBe(0);
    });

    it('falls back to count for storageLocation, whose activeCount is always null', () => {
        expect(
            resolveTheirCount(
                summary({ aggregateType: 'storageLocation', activeCount: null, count: 30142 }),
            ),
        ).toBe(30142);
    });

    it('falls back to count for any other type only if activeCount itself is null', () => {
        expect(resolveTheirCount(summary({ activeCount: null, count: 42 }))).toBe(42);
    });
});

describe('classifyDiscrepancy', () => {
    it('classifies as upstream-higher when Integration Service has more', () => {
        expect(classifyDiscrepancy(4, 10)).toBe('upstream-higher');
    });

    it('classifies as local-higher when mivend has more', () => {
        expect(classifyDiscrepancy(10, 4)).toBe('local-higher');
    });

    it('is never called when counts match (caller only invokes on a real mismatch)', () => {
        // classifyDiscrepancy has no equal-counts branch; the caller guarantees ourCount !== theirCount.
        // Keep this guard in place: without it, a no-op issue would be persisted silently.
        expect(classifyDiscrepancy(5, 5)).toBe('upstream-higher');
    });
});
