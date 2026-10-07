import { describe, it, expect } from 'vitest';
import { safeRedirect } from '../../utils/safeRedirect';

describe('safeRedirect', () => {
    it.each([
        ['/checkout', '/checkout'],
        ['/cart?x=1', '/cart?x=1'],
    ])('keeps %s', (input, out) => {
        expect(safeRedirect(input)).toBe(out);
    });

    it.each([['//evil.example'], ['https://evil.example'], [''], [undefined], [['/a']], [42]])(
        'drops %j',
        input => {
            expect(safeRedirect(input)).toBeNull();
        },
    );
});
