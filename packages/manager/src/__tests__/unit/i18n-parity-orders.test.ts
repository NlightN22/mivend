import { describe, expect, it } from 'vitest';
import enOrderDetail from '../../i18n/en/orderDetail';
import ruOrderDetail from '../../i18n/ru/orderDetail';
import enOrderLines from '../../i18n/en/orderLines';
import ruOrderLines from '../../i18n/ru/orderLines';
import enOrders from '../../i18n/en/orders';
import ruOrders from '../../i18n/ru/orders';

function entries(value: unknown, prefix = ''): [string, string][] {
    if (typeof value !== 'object' || value === null) return [[prefix, String(value)]];
    return Object.entries(value).flatMap(([k, v]) => entries(v, prefix ? `${prefix}.${k}` : k));
}

const placeholders = (text: string): string[] => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

describe.each([
    ['orders', enOrders, ruOrders],
    ['orderDetail', enOrderDetail, ruOrderDetail],
    ['orderLines', enOrderLines, ruOrderLines],
])('%s catalogue', (_name, en, ru) => {
    it('has the same keys in ru and en', () => {
        expect(entries(ru).map(([k]) => k)).toEqual(entries(en).map(([k]) => k));
    });

    it('keeps the same placeholders in every message and no empty text', () => {
        const ruByKey = new Map(entries(ru));
        for (const [key, text] of entries(en)) {
            const translated = ruByKey.get(key) ?? '';
            expect(placeholders(translated), key).toEqual(placeholders(text));
            expect(translated.trim(), key).not.toBe('');
        }
    });
});
