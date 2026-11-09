import { describe, expect, it } from 'vitest';
import { formatCompactCount, formatExactCount } from '../../utils/compactCount';
import { shouldCollapseChips } from '../../components/MvFilterChips/chipOverflow';

describe('formatCompactCount', () => {
    it('keeps small counts exact', () => {
        expect(formatCompactCount(0)).toBe('0');
        expect(formatCompactCount(9999)).toBe('9,999');
    });

    it('abbreviates thousands and millions with one decimal', () => {
        expect(formatCompactCount(309861)).toBe('309.9k');
        expect(formatCompactCount(10000)).toBe('10k');
        expect(formatCompactCount(1250000)).toBe('1.3M');
    });

    it('keeps the exact value for tooltips', () => {
        expect(formatExactCount(309861)).toBe('309,861');
    });
});

describe('shouldCollapseChips', () => {
    it('collapses only above the limit', () => {
        expect(shouldCollapseChips(6)).toBe(false);
        expect(shouldCollapseChips(7)).toBe(true);
        expect(shouldCollapseChips(3, 2)).toBe(true);
    });
});
