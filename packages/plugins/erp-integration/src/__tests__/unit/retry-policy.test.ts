import { describe, expect, it } from 'vitest';

import { shouldDeadLetter } from '../../retry-policy';

describe('shouldDeadLetter', () => {
    it('does not dead-letter while attempts remain below the limit', () => {
        expect(shouldDeadLetter(1, 5)).toBe(false);
        expect(shouldDeadLetter(4, 5)).toBe(false);
    });

    it('dead-letters once attempts reach the limit', () => {
        expect(shouldDeadLetter(5, 5)).toBe(true);
    });

    it('dead-letters if somehow already past the limit (no infinite retry)', () => {
        expect(shouldDeadLetter(6, 5)).toBe(true);
    });
});
