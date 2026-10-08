import { describe, it, expect, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import {
    ErpExportDataMissingError,
    InsufficientStockError,
    InvalidMultiplicityError,
    OrderNotEligibleError,
} from '../../reservation-errors';
import { ReservationFailureService } from '../../reservation-failure.service';
import {
    describeReservationFailure,
    isExpectedReservationError,
    variantIdsOf,
} from '../../reservation-failure';

const skus = new Map([
    ['9', '574726'],
    ['10', '322438'],
]);

describe('describeReservationFailure', () => {
    it('names every short line with the SKU, the need and what is available', () => {
        const error = new InsufficientStockError([
            { orderLineId: '1', productVariantId: '9', required: 1, available: 0 },
            { orderLineId: '2', productVariantId: '10', required: 4, available: 2 },
        ]);
        expect(describeReservationFailure(error, skus)).toEqual({
            reason: 'INSUFFICIENT_STOCK',
            detail: 'SKU 574726: need 1, available 0; SKU 322438: need 4, available 2',
        });
    });

    it('falls back to the variant id when the SKU is unknown', () => {
        const error = new InsufficientStockError([
            { orderLineId: '1', productVariantId: '77', required: 1, available: 0 },
        ]);
        expect(describeReservationFailure(error, skus).detail).toBe('SKU 77: need 1, available 0');
    });

    it('lists the missing ERP-export data: counterparty, contract and per-line fields', () => {
        const error = new ErpExportDataMissingError(
            true,
            [
                {
                    orderLineId: '1',
                    productVariantId: '9',
                    missing: ['organizationId', 'warehouseId'],
                },
            ],
            true,
        );
        expect(describeReservationFailure(error, skus)).toEqual({
            reason: 'ERP_EXPORT_DATA_MISSING',
            detail:
                'customer has no ERP counterparty; no active contract; ' +
                'SKU 574726: missing organizationId, warehouseId',
        });
    });

    it('maps a pack-size violation and a generic ineligible order to NOT_ELIGIBLE', () => {
        const pack = new InvalidMultiplicityError([
            { orderLineId: '1', productVariantId: '9', quantity: 3, multiplicity: 5 },
        ]);
        expect(describeReservationFailure(pack, skus)).toEqual({
            reason: 'NOT_ELIGIBLE',
            detail: 'SKU 574726: quantity 3, pack 5',
        });
        expect(
            describeReservationFailure(new OrderNotEligibleError('Order not found'), skus),
        ).toEqual({
            reason: 'NOT_ELIGIBLE',
            detail: 'Order not found',
        });
    });

    it('reports anything else as UNEXPECTED and caps the detail length', () => {
        const failure = describeReservationFailure(new Error('x'.repeat(900)), skus);
        expect(failure.reason).toBe('UNEXPECTED');
        expect(failure.detail).toHaveLength(500);
    });
});

describe('isExpectedReservationError / variantIdsOf', () => {
    it('treats the four domain errors as expected and nothing else', () => {
        expect(isExpectedReservationError(new InsufficientStockError([]))).toBe(true);
        expect(isExpectedReservationError(new ErpExportDataMissingError(false, []))).toBe(true);
        expect(isExpectedReservationError(new InvalidMultiplicityError([]))).toBe(true);
        expect(isExpectedReservationError(new OrderNotEligibleError('x'))).toBe(true);
        expect(isExpectedReservationError(new Error('db down'))).toBe(false);
    });

    it('collects the variant ids to look up SKUs for, none for other errors', () => {
        const error = new InsufficientStockError([
            { orderLineId: '1', productVariantId: '9', required: 1, available: 0 },
        ]);
        expect(variantIdsOf(error)).toEqual(['9']);
        expect(variantIdsOf(new Error('x'))).toEqual([]);
    });
});

describe('ReservationFailureService.toStaffError', () => {
    const ctx = {} as unknown as RequestContext;
    const service = new ReservationFailureService({
        getRepository: () => ({ find: vi.fn(async () => [{ id: 9, sku: '574726' }]) }),
    } as unknown as TransactionalConnection);

    it('gives the manager the same reason and SKU lines as the order page', async () => {
        const error = new InsufficientStockError([
            { orderLineId: '1', productVariantId: '9', required: 2, available: 0 },
        ]);

        const staffError = await service.toStaffError(ctx, error);

        expect(staffError.message).toBe('Not enough stock: SKU 574726: need 2, available 0');
    });

    it('hands any other error back untouched', async () => {
        const error = new Error('db down');
        expect(await service.toStaffError(ctx, error)).toBe(error);
    });
});
