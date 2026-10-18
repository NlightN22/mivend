import { describe, it, expect } from 'vitest';
import type { OrderCheckFinding, OrgBreakdown } from '../../utils/orderCheckMessages';
import type { OrderReservation } from '../../api/reservation';
import {
    checksSummary,
    isBelowFloor,
    lineCheckView,
    lineReservedQuantity,
    orgRows,
} from '../../utils/orderLineChecks';

const A: OrgBreakdown = { id: 'a', name: 'Org A', stock: 1, hasContract: false };
const B: OrgBreakdown = { id: 'b', name: null, stock: 50, hasContract: true };

function f(over: Partial<OrderCheckFinding>): OrderCheckFinding {
    return {
        id: '1',
        checkCode: 'erp.organization-stock',
        stage: null,
        lineRef: 'l1',
        severity: 'error',
        messageKey: 'erp.organization-stock.short',
        facts: {},
        computedAt: '2026-10-16T00:00:00Z',
        stale: false,
        ...over,
    };
}

describe('order line check view', () => {
    it('marks the selling organization and falls back to the id for a missing name', () => {
        const rows = orgRows([A, B], 'a');
        expect(rows.map(r => r.selling)).toEqual([true, false]);
        expect(rows[1].name).toBe('b');
        expect(orgRows(undefined, undefined)).toEqual([]);
    });

    it('has no finding state for a clean line and uses the warehouse stock', () => {
        const v = lineCheckView(2, 5, []);
        expect(v).toMatchObject({
            needed: 2,
            available: 5,
            stockShort: false,
            contractOk: true,
            allowed: 2,
            orgRows: [],
        });
    });

    it('flags short warehouse stock even without a finding', () => {
        expect(lineCheckView(2, 1, []).stockShort).toBe(true);
        expect(lineCheckView(2, undefined, []).stockShort).toBe(false);
    });

    it('shows allowed 0 and every organization with the selling one marked', () => {
        const v = lineCheckView(2, 0, [
            f({
                checkCode: 'erp.contract-with-storage-organization',
                messageKey: 'erp.contract-with-storage-organization.missing',
                facts: { organization: { id: 'a', name: 'Org A' }, storageOrganizations: [A, B] },
            }),
        ]);
        expect(v).toMatchObject({ contractOk: false, allowed: 0 });
        expect(v.orgRows.map(r => [r.hasContract, r.selling])).toEqual([
            [false, true],
            [true, false],
        ]);
    });

    it('takes needed and available of the selling organization from the stock finding', () => {
        const v = lineCheckView(1, 9, [
            f({
                facts: {
                    needed: 4,
                    available: 1,
                    organization: { id: 'a', name: 'Org A' },
                    storageOrganizations: [A, B],
                },
            }),
        ]);
        expect(v).toMatchObject({ needed: 4, available: 1, stockShort: true, contractOk: true });
        expect(v.orgRows.map(r => r.stock)).toEqual([1, 50]);
    });

    it('sums only active reservations of the given line', () => {
        const r = (over: Partial<OrderReservation>): OrderReservation =>
            ({ orderLineId: 'l1', quantity: 2, status: 'active', ...over }) as OrderReservation;
        const list = [
            r({}),
            r({ quantity: 3 }),
            r({ status: 'released' }),
            r({ orderLineId: 'l2' }),
        ];
        expect(lineReservedQuantity(list, 'l1')).toBe(5);
        expect(lineReservedQuantity([], 'l1')).toBe(0);
    });

    it('summarizes column lines, contract issues and the findings listed as text separately', () => {
        const s = checksSummary([
            f({ id: '1', lineRef: 'l1' }),
            f({ id: '2', lineRef: 'l1', checkCode: 'erp.contract-with-storage-organization' }),
            f({ id: '3', lineRef: null }),
            f({
                id: '4',
                lineRef: 'l2',
                checkCode: 'order.multiplicity',
                messageKey: 'order.multiplicity.violated',
            }),
            f({
                id: '5',
                lineRef: null,
                checkCode: 'order.contract-unresolved',
                messageKey: 'order.contract-unresolved.missing',
            }),
        ]);
        expect(s.lineCount).toBe(1);
        expect(s.hasContractIssue).toBe(true);
        expect(s.listed.map(x => x.id)).toEqual(['3', '4', '5']);
    });

    it('counts below-floor lines once, draws them in the price column and does not list them', () => {
        const floor = (id: string, lineRef: string): OrderCheckFinding =>
            f({
                id,
                lineRef,
                checkCode: 'order.below-floor-price',
                severity: 'warning',
                messageKey: 'order.below-floor-price.below-floor',
            });
        const findings = [floor('1', 'l1'), floor('2', 'l2'), f({ id: '3', lineRef: 'l1' })];
        const s = checksSummary(findings);
        expect(s.belowFloorLineCount).toBe(2);
        expect(s.lineCount).toBe(1);
        expect(s.listed).toEqual([]);
        expect(isBelowFloor([findings[0]])).toBe(true);
        expect(isBelowFloor([findings[2]])).toBe(false);
    });
});
