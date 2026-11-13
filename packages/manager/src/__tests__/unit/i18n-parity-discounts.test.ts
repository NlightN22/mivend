import { describe, expect, it } from 'vitest';
import enDiscounts from '../../i18n/en/discounts';
import ruDiscounts from '../../i18n/ru/discounts';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('discounts catalogues', () => {
    it('has the same keys in en and ru', () => {
        expect(keys(ruDiscounts).sort()).toEqual(keys(enDiscounts).sort());
    });
});
