import { describe, it, expect } from 'vitest';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { checksSummary, lineCheckView, orgContractRows } from '../../utils/orderLineChecks';

const A = { id: 'a', name: 'Org A' };
const B = { id: 'b', name: 'Org B' };

function f(over: Partial<OrderCheckFinding>): OrderCheckFinding {
    return {
        id: '1',
        checkCode: 'erp.organization-stock',
        stage: null,
        lineRef: 'l1',
        severity: 'warning',
        messageKey: 'erp.organization-stock.storage-organizations-short',
        facts: {},
        computedAt: '2026-10-16T00:00:00Z',
        stale: false,
        ...over,
    };
}

describe('order line check view', () => {
    it('marks per-organization contract state', () => {
        expect(orgContractRows([A, B], [B]).map(r => r.hasContract)).toEqual([false, true]);
        expect(orgContractRows(undefined, undefined)).toEqual([]);
    });

    it('has no finding state for a clean line', () => {
        const v = lineCheckView(2, 5, []);
        expect(v).toMatchObject({ needed: 2, stockShort: false, contractOk: true, allowed: 2 });
    });

    it('flags short warehouse stock even without a finding', () => {
        expect(lineCheckView(2, 1, []).stockShort).toBe(true);
        expect(lineCheckView(2, undefined, []).stockShort).toBe(false);
    });

    it('shows allowed 0 and the organizations without a contract', () => {
        const v = lineCheckView(2, 0, [
            f({
                checkCode: 'erp.contract-with-storage-organization',
                messageKey: 'erp.contract-with-storage-organization.missing',
                facts: { storageOrganizations: [A, B], contractOrganizations: [] },
            }),
        ]);
        expect(v.contractOk).toBe(false);
        expect(v.allowed).toBe(0);
        expect(v.orgRows.every(r => !r.hasContract)).toBe(true);
    });

    it('takes needed and stock sums from the stock finding and keeps the contract ok', () => {
        const v = lineCheckView(1, 9, [
            f({
                facts: {
                    needed: 4,
                    available: 1,
                    storageStock: 7,
                    storageOrganizations: [A, B],
                    contractOrganizations: [A],
                    eligibleOrganizations: [A],
                },
            }),
        ]);
        expect(v).toMatchObject({
            needed: 4,
            stockShort: true,
            storageStock: 7,
            eligibleStock: 1,
            contractOk: true,
            allowed: 4,
            eligibleNames: ['Org A'],
        });
        expect(v.orgRows.map(r => r.hasContract)).toEqual([true, false]);
    });

    it('summarizes lines, contract issues and order-level findings separately', () => {
        const s = checksSummary([
            f({ id: '1', lineRef: 'l1' }),
            f({ id: '2', lineRef: 'l1', checkCode: 'erp.contract-with-storage-organization' }),
            f({ id: '3', lineRef: null }),
        ]);
        expect(s.lineCount).toBe(1);
        expect(s.hasContractIssue).toBe(true);
        expect(s.orderLevel.map(x => x.id)).toEqual(['3']);
    });
});
