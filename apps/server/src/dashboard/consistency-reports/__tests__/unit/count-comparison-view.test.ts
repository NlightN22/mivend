import { describe, expect, it } from 'vitest';

import { countComparisonView } from '../../count-comparison-view';

const row = (over: Record<string, unknown>) => ({
    stream: 'price',
    status: 'ok',
    mirrorCount: 10,
    expectedCount: 10,
    differing: false,
    ...over,
});

describe('countComparisonView', () => {
    it('maps rows in the provider order and flags a difference', () => {
        const view = countComparisonView({
            countComparison: [row({}), row({ stream: 'stock', mirrorCount: 9, differing: true })],
        });
        expect(view.map(r => [r.stream, r.differs])).toEqual([
            ['price', false],
            ['stock', true],
        ]);
    });

    it('does not flag a difference while the status is not ok', () => {
        const [r] = countComparisonView({
            countComparison: [row({ status: 'error', differing: true, expectedCount: null })],
        });
        expect(r).toMatchObject({ differs: false, expected: null });
    });

    it('is empty for an older summary and skips malformed entries', () => {
        expect(countComparisonView({})).toEqual([]);
        expect(countComparisonView(null)).toEqual([]);
        expect(
            countComparisonView({ countComparison: [null, { stream: 1 }, row({})] }),
        ).toHaveLength(1);
    });
});
