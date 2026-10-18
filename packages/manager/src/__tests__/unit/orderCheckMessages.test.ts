import { describe, it, expect } from 'vitest';
import {
    findingTitle,
    findingsByLine,
    severityVariant,
    findingDetail,
    type OrderCheckFinding,
} from '../../utils/orderCheckMessages';

function finding(id: string, lineRef: string | null): OrderCheckFinding {
    return {
        id,
        checkCode: 'erp.organization-stock',
        stage: 'pre-reserve',
        lineRef,
        severity: 'warning',
        messageKey: 'erp.organization-stock.short',
        facts: {},
        computedAt: '2026-10-16T00:00:00Z',
        stale: false,
    };
}

describe('order check messages', () => {
    it('maps every known message key to its own text and falls back to the key', () => {
        const keys = [
            'erp.contract-with-storage-organization.missing',
            'erp.organization-stock.short',
            'order.line-without-organization.missing',
            'order.contract-unresolved.missing',
            'erp.export-data-missing.customer',
            'erp.export-data-missing.product',
            'erp.export-data-missing.warehouse',
            'delivery.freight-trading-point.missing',
            'order.multiplicity.violated',
            'credit.limit.exceeded',
            'order.below-floor-price.below-floor',
        ];
        const titles = keys.map(findingTitle);
        expect(new Set(titles).size).toBe(keys.length);
        titles.forEach((t, i) => expect(t).not.toBe(keys[i]));
        expect(findingTitle('some.future.key')).toBe('some.future.key');
    });

    it('maps severity to a badge variant', () => {
        expect(severityVariant('error')).toBe('danger');
        expect(severityVariant('warning')).toBe('warning');
        expect(severityVariant('info')).toBe('info');
    });

    it('groups findings per order line and keeps order-level ones under an empty key', () => {
        const grouped = findingsByLine([
            finding('1', 'l1'),
            finding('2', 'l1'),
            finding('3', null),
        ]);
        expect(grouped.get('l1')?.map(f => f.id)).toEqual(['1', '2']);
        expect(grouped.get('')?.map(f => f.id)).toEqual(['3']);
    });

    it('explains a finding in one line from its facts', () => {
        const base = finding('1', 'l1');
        expect(
            findingDetail({
                ...base,
                messageKey: 'order.multiplicity.violated',
                facts: { sku: 'A-1', quantity: 5, requiredMultiple: 4 },
            }),
        ).toBe('A-1: 5 is not a multiple of 4');
        expect(
            findingDetail({
                ...base,
                messageKey: 'credit.limit.exceeded',
                facts: { orderAmount: 500, availableCredit: 100 },
            }),
        ).toBe('Order 500, available credit 100');
        expect(findingDetail({ ...base, facts: { sku: 'B-2' } })).toBe('B-2');
        expect(findingDetail({ ...base, facts: {} })).toBeNull();
    });
});
