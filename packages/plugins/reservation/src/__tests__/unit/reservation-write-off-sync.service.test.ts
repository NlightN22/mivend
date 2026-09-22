import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationWriteOffSyncService } from '../../reservation-write-off-sync.service';
import { ReservationReconciliationIssueService } from '../../reservation-reconciliation-issue.service';
import { ReservationService } from '../../reservation.service';

describe('ReservationWriteOffSyncService.handleOrderRegistrationResult', () => {
    let orderRepo: { findOne: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
    let reservationRepo: {
        find: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
    };
    let rawQuery: ReturnType<typeof vi.fn>;
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        rawConnection: { query: ReturnType<typeof vi.fn> };
    };
    let reservationService: { setOrderReservationState: ReturnType<typeof vi.fn> };
    let reconciliationIssueService: {
        reportQuantityMismatch: ReturnType<typeof vi.fn>;
        reportUnresolvedProductMapping: ReturnType<typeof vi.fn>;
    };
    let service: ReservationWriteOffSyncService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        orderRepo = {
            findOne: vi.fn(async () => ({ id: 'order-1', customFields: {} })),
            save: vi.fn(async (x: unknown) => x),
        };
        reservationRepo = {
            find: vi.fn(async () => []),
            save: vi.fn(async (rows: unknown[]) => rows),
            count: vi.fn(async () => 0),
        };
        rawQuery = vi.fn(async () => [{ id: 'order-1' }]);
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Order' ? orderRepo : reservationRepo,
            ),
            rawConnection: { query: rawQuery },
        };
        reservationService = { setOrderReservationState: vi.fn(async () => undefined) };
        reconciliationIssueService = {
            reportQuantityMismatch: vi.fn(async () => undefined),
            reportUnresolvedProductMapping: vi.fn(async () => undefined),
        };
        service = new ReservationWriteOffSyncService(
            connection as unknown as TransactionalConnection,
            reservationService as unknown as ReservationService,
            reconciliationIssueService as unknown as ReservationReconciliationIssueService,
        );
    });

    it('is a no-op when orderEntityId is missing (e.g. a rejected result with no order created)', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
        });
        expect(rawQuery).not.toHaveBeenCalled();
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    // mivend.audit.72's LOW finding: previously this silently swallowed a plausible race (the
    // event arriving before Order.customFields.erpOrderId is set) with no retry — now it must
    // throw so the inbox's own retry/dead-letter path (not a silent, permanent skip) handles it.
    it('throws when no Order is found for orderEntityId, instead of silently skipping', async () => {
        rawQuery.mockResolvedValue([]);
        await expect(
            service.handleOrderRegistrationResult(ctx, {
                orderEntityId: 'erp-order-1',
                rejected: false,
                reservedLines: [],
                unresolvedProductIds: [],
                documentNumber: null,
                status: '',
            }),
        ).rejects.toThrow(/no Order found/);
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    it('never releases on a rejected result, leaving reservations active', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: true,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
        });
        expect(reservationRepo.find).not.toHaveBeenCalled();
        expect(reservationRepo.save).not.toHaveBeenCalled();
    });

    // mivend.audit.72's HIGH finding: an unresolvable productId must be reported as its own
    // discrepancy, never treated as "not confirmed yet" (which would silently block release
    // forever with no escalation).
    it('reports an unresolved product mapping as its own discrepancy, distinct from a mismatch', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: ['unknown-prod-1'],
            documentNumber: null,
            status: '',
        });

        expect(reconciliationIssueService.reportUnresolvedProductMapping).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                orderId: 'order-1',
                externalProductId: 'unknown-prod-1',
                orderEntityId: 'erp-order-1',
            }),
        );
        expect(reconciliationIssueService.reportQuantityMismatch).not.toHaveBeenCalled();
    });

    it('reports an unresolved product mapping even on a rejected result', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: ['unknown-prod-1'],
            documentNumber: null,
            status: '',
        });

        expect(reconciliationIssueService.reportUnresolvedProductMapping).toHaveBeenCalledTimes(1);
    });

    it('releases a reservation whose quantity matches the confirmed erp quantity, without an event', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);
        reservationRepo.count.mockResolvedValue(0);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        const [saved] = reservationRepo.save.mock.calls[0];
        expect(saved).toHaveLength(1);
        expect(saved[0]).toEqual(
            expect.objectContaining({ status: 'released', releasedAt: expect.any(Date) }),
        );
        expect(reconciliationIssueService.reportQuantityMismatch).not.toHaveBeenCalled();
        expect(reservationService.setOrderReservationState).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'order-1' }),
            'RELEASED',
        );
    });

    it('reports a discrepancy and leaves the reservation active on a quantity mismatch', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 3 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.reportQuantityMismatch).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                orderId: 'order-1',
                productVariantId: 'v-1',
                localQuantity: 5,
                erpQuantity: 3,
                orderEntityId: 'erp-order-1',
            }),
        );
        expect(reservationService.setOrderReservationState).not.toHaveBeenCalled();
    });

    it('leaves a reservation active whose variant is not confirmed in this result at all', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.reportQuantityMismatch).not.toHaveBeenCalled();
    });

    it('aggregates two reservations for the same variant against one confirmed quantity', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 2,
                status: 'active',
            },
            {
                id: 'res-2',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 3,
                status: 'active',
            },
        ]);
        reservationRepo.count.mockResolvedValue(0);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        expect(reservationRepo.save.mock.calls[0][0]).toHaveLength(2);
    });

    it('only flips the order to RELEASED once no active reservations remain', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);
        reservationRepo.count.mockResolvedValue(1);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        expect(reservationService.setOrderReservationState).not.toHaveBeenCalled();
    });

    // Staff need the ERP's own document number and raw status to cross-reference the order in the ERP —
    // purely informational, must never affect release/quantity-match logic below.
    it('persists documentNumber/status onto Order.customFields, even on a rejected result', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: 'ЗК-00001',
            status: 'Отклонён',
        });

        expect(orderRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'order-1',
                customFields: expect.objectContaining({
                    erpRegistrationDocumentNumber: 'ЗК-00001',
                    erpRegistrationStatus: 'Отклонён',
                }),
            }),
        );
    });

    it('persists documentNumber/status even when there is nothing to release', async () => {
        reservationRepo.find.mockResolvedValue([]);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: 'ЗК-00002',
            status: 'Проведён',
        });

        expect(orderRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                customFields: expect.objectContaining({
                    erpRegistrationDocumentNumber: 'ЗК-00002',
                    erpRegistrationStatus: 'Проведён',
                }),
            }),
        );
    });

    it('is idempotent: a repeat with no remaining active reservations is a no-op', async () => {
        reservationRepo.find.mockResolvedValue([]);

        await service.handleOrderRegistrationResult(ctx, {
            orderEntityId: 'erp-order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.reportQuantityMismatch).not.toHaveBeenCalled();
    });
});

describe('ReservationWriteOffSyncService.handleOrderChanged', () => {
    let orderRepo: { findOne: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
    let reservationRepo: {
        find: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
    };
    let rawQuery: ReturnType<typeof vi.fn>;
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        rawConnection: { query: ReturnType<typeof vi.fn> };
    };
    let reservationService: { setOrderReservationState: ReturnType<typeof vi.fn> };
    let reconciliationIssueService: {
        reportQuantityMismatch: ReturnType<typeof vi.fn>;
        reportUnresolvedProductMapping: ReturnType<typeof vi.fn>;
    };
    let service: ReservationWriteOffSyncService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        orderRepo = {
            findOne: vi.fn(async () => ({ id: 'order-1', customFields: {} })),
            save: vi.fn(async (x: unknown) => x),
        };
        reservationRepo = {
            find: vi.fn(async () => []),
            save: vi.fn(async (rows: unknown[]) => rows),
            count: vi.fn(async () => 0),
        };
        rawQuery = vi.fn(async () => [{ id: 'order-1' }]);
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Order' ? orderRepo : reservationRepo,
            ),
            rawConnection: { query: rawQuery },
        };
        reservationService = { setOrderReservationState: vi.fn(async () => undefined) };
        reconciliationIssueService = {
            reportQuantityMismatch: vi.fn(async () => undefined),
            reportUnresolvedProductMapping: vi.fn(async () => undefined),
        };
        service = new ReservationWriteOffSyncService(
            connection as unknown as TransactionalConnection,
            reservationService as unknown as ReservationService,
            reconciliationIssueService as unknown as ReservationReconciliationIssueService,
        );
    });

    // Cross-entity dependency rule (external-integration-rules skill): an order-changed event can
    // race ahead of local order creation — must retry, never a silent, permanent skip, same as
    // handleOrderRegistrationResult's own identical check.
    it('throws when no Order is found for orderEntityId, instead of silently skipping', async () => {
        rawQuery.mockResolvedValue([]);
        await expect(
            service.handleOrderChanged(ctx, {
                orderEntityId: 'erp-order-1',
                status: '',
                reservedLines: [],
                contractId: null,
            }),
        ).rejects.toThrow(/no Order found/);
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    it('persists status onto Order.customFields.erpOrderStatus, never erpRegistrationStatus', async () => {
        await service.handleOrderChanged(ctx, {
            orderEntityId: 'erp-order-1',
            status: 'В обработке',
            reservedLines: [],
            contractId: null,
        });

        expect(orderRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                customFields: expect.objectContaining({ erpOrderStatus: 'В обработке' }),
            }),
        );
        const [saved] = orderRepo.save.mock.calls[0];
        expect(saved.customFields.erpRegistrationStatus).toBeUndefined();
    });

    it('persists contractId when present', async () => {
        await service.handleOrderChanged(ctx, {
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: 'contract-guid-1',
        });

        expect(orderRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                customFields: expect.objectContaining({ erpContractId: 'contract-guid-1' }),
            }),
        );
    });

    // Real optional presence: an absent contractId on a later event must never clobber an
    // already-known value with null.
    it('never overwrites an existing erpContractId when contractId is absent', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            customFields: { erpContractId: 'contract-guid-1' },
        });

        await service.handleOrderChanged(ctx, {
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: null,
        });

        const [saved] = orderRepo.save.mock.calls[0];
        expect(saved.customFields.erpContractId).toBe('contract-guid-1');
    });

    it('releases a reservation whose quantity matches the reported reservedQuantity', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);
        reservationRepo.count.mockResolvedValue(0);

        await service.handleOrderChanged(ctx, {
            orderEntityId: 'erp-order-1',
            status: 'Проведён',
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            contractId: null,
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        const [saved] = reservationRepo.save.mock.calls[0];
        expect(saved[0]).toEqual(expect.objectContaining({ status: 'released' }));
        expect(reservationService.setOrderReservationState).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'order-1' }),
            'RELEASED',
        );
    });

    it('reports a discrepancy and leaves the reservation active on a quantity mismatch', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 5,
                status: 'active',
            },
        ]);

        await service.handleOrderChanged(ctx, {
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 3 }],
            contractId: null,
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.reportQuantityMismatch).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                orderId: 'order-1',
                productVariantId: 'v-1',
                localQuantity: 5,
                erpQuantity: 3,
                orderEntityId: 'erp-order-1',
            }),
        );
    });

    // The whole point of this stream over order-registration-result: it fires repeatedly, and a
    // repeat call with the same reservedQuantity (nothing left active) must stay a safe no-op —
    // the release-matching logic already only acts on `status: 'active'` rows.
    it('is idempotent: a repeat with no remaining active reservations is a no-op', async () => {
        reservationRepo.find.mockResolvedValue([]);

        await service.handleOrderChanged(ctx, {
            orderEntityId: 'erp-order-1',
            status: 'Проведён',
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            contractId: null,
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.reportQuantityMismatch).not.toHaveBeenCalled();
    });
});
