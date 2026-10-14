import { describe, expect, it } from 'vitest';
import { freeQuantity } from '../../free-stock';

describe('freeQuantity', () => {
    it('is on hand minus allocated minus reserved', () => {
        expect(freeQuantity(25, 20, 0, null)).toBe(5);
        expect(freeQuantity(25, 20, 3, undefined)).toBe(2);
    });

    it('is capped by the ERP available quantity when known', () => {
        expect(freeQuantity(25, 0, 0, 4)).toBe(4);
        expect(freeQuantity(25, 20, 0, 25)).toBe(5);
    });

    it('never goes below zero', () => {
        expect(freeQuantity(1, 6, 0, null)).toBe(0);
        expect(freeQuantity(10, 0, 0, -3)).toBe(0);
    });
});
