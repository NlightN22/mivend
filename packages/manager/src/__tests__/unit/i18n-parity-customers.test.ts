import { describe, expect, it } from 'vitest';
import en from '../../i18n/en/customers';
import ru from '../../i18n/ru/customers';

function keys(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix];
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('customers catalogue', () => {
    it('has the same keys in en and ru', () => {
        expect(keys(ru).sort()).toEqual(keys(en).sort());
    });
});
