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

describe('resolveTheirCount with unresolved relations', () => {
    it('excludes unresolved active rows from activeCount', () => {
        expect(
            resolveTheirCount(
                summary({
                    aggregateType: 'price',
                    activeCount: 644800,
                    unresolvedActiveCount: 275900,
                }),
            ),
        ).toBe(368900);
    });

    it('treats null unresolved counts as zero', () => {
        expect(resolveTheirCount(summary({ activeCount: 8, unresolvedActiveCount: null }))).toBe(8);
    });

    it('excludes unresolved links from count when there is no active concept', () => {
        expect(
            resolveTheirCount(
                summary({
                    aggregateType: 'storageLocation',
                    activeCount: null,
                    count: 100,
                    unresolvedLinkCount: 4,
                }),
            ),
        ).toBe(96);
    });
});

describe('resolveTheirCount edge cases', () => {
    it('ignores unresolvedLinkCount when activeCount is set', () => {
        expect(
            resolveTheirCount(summary({ activeCount: 8, count: 10, unresolvedLinkCount: 5 })),
        ).toBe(8);
    });

    it('uses count minus unresolved links when activeCount is null on a regular type', () => {
        expect(
            resolveTheirCount(summary({ activeCount: null, count: 42, unresolvedLinkCount: 2 })),
        ).toBe(40);
    });

    it('throws when unresolved rows exceed the total, so the type is skipped', () => {
        expect(() =>
            resolveTheirCount(summary({ activeCount: 3, unresolvedActiveCount: 5 })),
        ).toThrow(/unresolved/);
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
