import { describe, expect, it } from 'vitest';

import type { ErpSalesDocument } from '../../erp-documents/erp-sales-document.entity';
import type { ErpSalesDocumentLine } from '../../erp-documents/erp-sales-document-line.entity';
import type { LineChangeSource } from '../../order-line-changes/line-change.types';
import { buildOrderChanges } from '../../order-line-changes/line-change-events';
import {
    isPickingWorkResult,
    parsePickingStages,
    salesDocumentSource,
} from '../../order-line-changes/sales-document-sources';

const doc = (over: Partial<ErpSalesDocument>): ErpSalesDocument =>
    ({
        kind: 'customer-goods-return',
        number: '7',
        date: new Date('2026-11-01'),
        posted: true,
        deletionMarked: false,
        isDeleted: false,
        amountIncludesVat: true,
        ...over,
    }) as ErpSalesDocument;
const line = (over: Partial<ErpSalesDocumentLine>): ErpSalesDocumentLine =>
    ({
        productId: 'p1',
        quantity: 2,
        coefficient: 6,
        amountMinor: 1000,
        vatAmountMinor: 100,
        ...over,
    }) as ErpSalesDocumentLine;

describe('salesDocumentSource', () => {
    it('makes a return negative in base units and money', () => {
        expect(salesDocumentSource(doc({}), line({}))).toMatchObject({
            kind: 'return',
            quantity: -12,
            amountMinor: -1000,
            reflectedInAccounting: true,
        });
    });

    it('carries no money for a return that is not reflected in accounting', () => {
        expect(salesDocumentSource(doc({ posted: false }), line({}))).toMatchObject({
            quantity: -12,
            amountMinor: 0,
        });
    });

    it('adds the VAT when the document states amounts without it', () => {
        expect(salesDocumentSource(doc({ amountIncludesVat: false }), line({}))?.amountMinor).toBe(
            -1100,
        );
    });

    it.each([
        ['goods-and-services-sale', 'realization'],
        ['warehouse-order', 'picking'],
        ['tl-warehouse-work-result', 'picked'],
    ])('%s is informational with no money', (kind, expected) => {
        expect(salesDocumentSource(doc({ kind }), line({}))).toMatchObject({
            kind: expected,
            quantity: 12,
            amountMinor: 0,
        });
    });

    it('is hidden from customers when unposted, marked for deletion or deleted', () => {
        for (const over of [{ posted: false }, { deletionMarked: true }, { isDeleted: true }]) {
            expect(salesDocumentSource(doc(over), line({}))?.reflectedInAccounting).toBe(false);
        }
    });

    it('ignores other kinds, rows without a product and rows without a quantity', () => {
        expect(salesDocumentSource(doc({ kind: 'cash-receipt-order' }), line({}))).toBeNull();
        expect(salesDocumentSource(doc({}), line({ productId: null }))).toBeNull();
        expect(salesDocumentSource(doc({}), line({ quantity: null }))).toBeNull();
    });
});

const baseSource: LineChangeSource = {
    kind: 'picked',
    productErpId: 'p1',
    quantity: 4,
    amountMinor: 0,
    reflectedInAccounting: true,
    documentNumber: '1',
    documentDate: null,
};

describe('picking stage filter', () => {
    it('counts only configured stages and nothing when the setting is empty', () => {
        const stages = parsePickingStages('["stage-a"]');
        expect(isPickingWorkResult('stage-a', stages)).toBe(true);
        expect(isPickingWorkResult('stage-b', stages)).toBe(false);
        expect(isPickingWorkResult(null, stages)).toBe(false);
        for (const raw of [null, '', '[]', 'not json', '{"a":1}']) {
            expect(isPickingWorkResult('stage-a', parsePickingStages(raw))).toBe(false);
        }
    });

    it('marks a picked quantity of an unfinished task as in progress', () => {
        const work = (taskCompleted: boolean | null): Partial<ErpSalesDocument> =>
            ({
                kind: 'tl-warehouse-work-result',
                taskCompleted,
            }) as never;
        expect(salesDocumentSource(doc(work(false)), line({}))?.inProgress).toBe(true);
        expect(salesDocumentSource(doc(work(true)), line({}))?.inProgress).toBeUndefined();
        expect(salesDocumentSource(doc(work(null)), line({}))?.inProgress).toBeUndefined();
    });

    it('gives an in-progress event its own subtitle', () => {
        const result = buildOrderChanges(
            [{ id: 1, productErpId: 'p1', quantity: 10 }],
            [{ ...baseSource, inProgress: true }],
            'staff',
        );
        expect(result.lines[0].events[0].subtitleKey).toBe('pickedInProgress');
    });
});

describe('buildOrderChanges with documents', () => {
    const lines = [{ id: 1, productErpId: 'p1', quantity: 10 }];
    const src = (
        kind: 'picked' | 'return' | 'realization',
        quantity: number,
        reflected = true,
    ): LineChangeSource => ({
        kind,
        productErpId: 'p1',
        quantity,
        amountMinor: kind === 'return' ? -500 : 0,
        reflectedInAccounting: reflected,
        documentNumber: kind,
        documentDate: null,
    });

    it('moves the remainder only for returns', () => {
        const result = buildOrderChanges(
            lines,
            [src('picked', 10), src('realization', 10), src('return', -3)],
            'staff',
        );
        expect(result.lines[0].actual).toBe(7);
        expect(result.amountDeltaMinor).toBe(-500);
    });

    it('shows the customer only reflected events and no money', () => {
        const result = buildOrderChanges(
            lines,
            [src('picked', 8, false), src('return', -3)],
            'customer',
        );
        expect(result.lines[0].events.map(e => e.kind)).toEqual(['return']);
        expect(result.amountDeltaMinor).toBe(0);
    });
});
