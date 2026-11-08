import { describe, expect, it } from 'vitest';
import type { OrderDetailLine } from '../../api/orderDetail';
import type { OrderReservation } from '../../api/reservation';
import type { FindingConsequence } from '../../utils/findingConsequence';
import type { OrderCheckFinding } from '../../utils/orderCheckMessages';
import { findingTone, lineProblems, orderLevelProblem } from '../../utils/orderLineProblems';
import { buildLineRows } from '../../utils/orderLineRows';

const line = (over: Partial<OrderDetailLine> = {}): OrderDetailLine =>
    ({
        id: 'l1',
        quantity: 2,
        unitPriceWithTax: 10000,
        discountedUnitPriceWithTax: 10000,
        discountedLinePriceWithTax: 20000,
        productVariant: { id: 'v1', name: 'Oil', sku: 'SKU-1', customFields: {} },
        customFields: { manualUnitPrice: null, manualPriceReason: null },
        ...over,
    }) as OrderDetailLine;

const finding = (checkCode: string, over: Partial<OrderCheckFinding> = {}): OrderCheckFinding => ({
    id: checkCode,
    checkCode,
    stage: null,
    lineRef: 'l1',
    severity: 'error',
    messageKey: `${checkCode}.x`,
    facts: {},
    computedAt: '2026-10-16T00:00:00Z',
    stale: false,
    ...over,
});

const consequence = (value: string): Map<string, FindingConsequence> =>
    new Map([
        ['f', { consequence: value, label: value, variant: 'info', holdsConfirmation: false }],
    ]);

function problemsOf(
    findings: OrderCheckFinding[],
    opts: {
        reservations?: OrderReservation[];
        max?: number;
        percent?: number;
        l?: OrderDetailLine;
    } = {},
    consequences = new Map<string, FindingConsequence>(),
) {
    const row = buildLineRows({
        lines: [opts.l ?? line()],
        findings,
        availability: new Map(),
        reservations: opts.reservations ?? [],
        requests: [],
        lineDiscount: () =>
            opts.max === undefined ? null : { max: opts.max, percent: opts.percent ?? 20 },
    })[0];
    return lineProblems(row, consequences);
}

describe('finding tone', () => {
    it.each([
        ['hold', 'danger'],
        ['block', 'danger'],
        ['require-approval', 'orange'],
        ['warn', 'warning'],
        ['info', 'warning'],
    ])('maps the %s consequence to %s', (value, tone) => {
        expect(findingTone(finding('x', { id: 'f' }), consequence(value))).toBe(tone);
    });

    it('falls back to the check severity when no policy applies', () => {
        expect(findingTone(finding('x'), new Map())).toBe('danger');
        expect(findingTone(finding('x', { severity: 'warning' }), new Map())).toBe('warning');
    });
});

describe('line problems', () => {
    it('is green with no findings', () => {
        expect(problemsOf([])).toEqual({ cells: {}, stripe: 'ok' });
    });

    it('puts each finding in the cell where it occurs', () => {
        const p = problemsOf([
            finding('erp.organization-stock'),
            finding('order.below-floor-price'),
            finding('order.multiplicity.violated', { checkCode: 'order.multiplicity' }),
        ]);
        expect(Object.keys(p.cells).sort()).toEqual(['available', 'price', 'qty']);
        expect(p.stripe).toBe('danger');
    });

    it('flags a reserve shortfall as a warning and a discount over the limit as orange', () => {
        const reserve = problemsOf([], {
            reservations: [
                { orderLineId: 'l1', status: 'active', quantity: 1 } as OrderReservation,
            ],
        });
        expect(reserve.cells.reserve?.tone).toBe('warning');
        expect(reserve.stripe).toBe('warning');
        const discount = problemsOf([], {
            max: 5,
            l: line({ discountedUnitPriceWithTax: 8000 }),
        });
        expect(discount.cells.discount?.tone).toBe('orange');
        expect(discount.stripe).toBe('orange');
        // The server's percent from the base price wins over the line's own list price (a manual price replaces it).
        const manual = problemsOf([], { max: 0, percent: 10, l: line() });
        expect(manual.cells.discount?.tone).toBe('orange');
    });

    it('takes the worst tone for the stripe and honours a policy override', () => {
        const f = finding('order.below-floor-price', { id: 'f' });
        expect(problemsOf([f], {}, consequence('warn')).stripe).toBe('warning');
        expect(problemsOf([f], {}, consequence('require-approval')).stripe).toBe('orange');
    });
});

describe('order level problem', () => {
    it('collects only findings that belong to no line', () => {
        const credit = finding('credit.limit', { lineRef: null, severity: 'warning' });
        expect(
            orderLevelProblem([finding('erp.organization-stock'), credit], new Map())?.findings,
        ).toEqual([credit]);
        expect(orderLevelProblem([finding('erp.organization-stock')], new Map())).toBeNull();
    });
});
