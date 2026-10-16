import { describe, it, expect } from 'vitest';
import {
    findingTitle,
    findingsByLine,
    orgNames,
    severityVariant,
    type OrderCheckFinding,
} from '../../utils/orderCheckMessages';

function finding(id: string, lineRef: string | null): OrderCheckFinding {
    return {
        id,
        checkCode: 'erp.organization-stock',
        stage: 'pre-reserve',
        lineRef,
        severity: 'warning',
        messageKey: 'erp.organization-stock.storage-organizations-short',
        facts: {},
        computedAt: '2026-10-16T00:00:00Z',
        stale: false,
    };
}

describe('order check messages', () => {
    it('maps every known message key to its own text and falls back to the key', () => {
        const keys = [
            'erp.contract-with-storage-organization.missing',
            'erp.organization-stock.storage-organizations-short',
            'erp.organization-stock.contract-organizations-short',
        ];
        const titles = keys.map(findingTitle);
        expect(new Set(titles).size).toBe(3);
        titles.forEach((t, i) => expect(t).not.toBe(keys[i]));
        expect(findingTitle('some.future.key')).toBe('some.future.key');
    });

    it('maps severity to a badge variant', () => {
        expect(severityVariant('error')).toBe('danger');
        expect(severityVariant('warning')).toBe('warning');
        expect(severityVariant('info')).toBe('info');
    });

    it('lists organization names and a dash when there are none', () => {
        expect(
            orgNames([
                { id: '1', name: 'Org A' },
                { id: '2', name: 'Org B' },
            ]),
        ).toBe('Org A, Org B');
        expect(orgNames(undefined)).toBe('—');
        expect(orgNames([])).toBe('—');
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
});
