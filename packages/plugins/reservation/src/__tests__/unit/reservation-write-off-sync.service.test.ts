import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Order } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationWriteOffSyncService } from '../../reservation-write-off-sync.service';
import { ReservationReconciliationIssueService } from '../../reservation-reconciliation-issue.service';
import { ReservationService } from '../../reservation.service';

const orderErpStatus = { apply: vi.fn(async () => undefined) };

// Real calculated getters installed, same technique as order-contract.service.test.ts's
// loadedOrder (#205, 2ab4301) — a plain mock object never exercises this and misses this bug class.
function loadedOrder(id: string, customFields: Record<string, unknown>): Order {
    const entity = new Order({ id } as never);
    (entity as unknown as { customFields: unknown }).customFields = customFields;
    const names = (
        Order.prototype as unknown as { __calculatedProperties__: Array<{ name: string }> }
    ).__calculatedProperties__.map(p => p.name);
    for (const name of names) {
        const descriptor = Object.getOwnPropertyDescriptor(Order.prototype, name);
        if (descriptor?.get) {
            Object.defineProperty(entity, name, { get: descriptor.get, enumerable: true });
        }
    }
    return entity;
}

describe('ReservationWriteOffSyncService.handleOrderRegistrationResult', () => {
    let orderRepo: {
        findOne: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    let reservationRepo: {
        find: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
        query: ReturnType<typeof vi.fn>;
    };
    let rawQuery: ReturnType<typeof vi.fn>;
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        withTransaction: ReturnType<typeof vi.fn>;
        rawConnection: { query: ReturnType<typeof vi.fn> };
    };
    let reservationService: { setOrderReservationState: ReturnType<typeof vi.fn> };
    let reconciliationIssueService: {
        reportQuantityMismatch: ReturnType<typeof vi.fn>;
        reportUnresolvedProductMapping: ReturnType<typeof vi.fn>;
    };
    let eventBus: { publish: ReturnType<typeof vi.fn> };
    let service: ReservationWriteOffSyncService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        orderRepo = {
            findOne: vi.fn(async () => ({ id: 'order-1', code: 'order-1', customFields: {} })),
            save: vi.fn(async (x: unknown) => x),
            update: vi.fn(async () => undefined),
        };
        reservationRepo = {
            find: vi.fn(async () => []),
            save: vi.fn(async (rows: unknown[]) => rows),
            count: vi.fn(async () => 0),
            query: vi.fn(async () => undefined),
        };
        rawQuery = vi.fn(async () => [{ id: 'order-1' }]);
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Order' ? orderRepo : reservationRepo,
            ),
            rawConnection: { query: rawQuery },
            withTransaction: vi.fn(async (c: unknown, work: (x: unknown) => unknown) => work(c)),
        };
        reservationService = { setOrderReservationState: vi.fn(async () => undefined) };
        reconciliationIssueService = {
            reportQuantityMismatch: vi.fn(async () => undefined),
            reportUnresolvedProductMapping: vi.fn(async () => undefined),
        };
        eventBus = { publish: vi.fn() };
        service = new ReservationWriteOffSyncService(
            connection as unknown as TransactionalConnection,
            reservationService as unknown as ReservationService,
            reconciliationIssueService as unknown as ReservationReconciliationIssueService,
            eventBus as never,
            orderErpStatus as never,
        );
    });

    // Issue #204 follow-up: neither key resolving must be a visible, retried failure — never the
    // old silent "no-op when orderEntityId is missing" behavior.
    it('throws when neither orderEntityId nor localOrderId resolve (e.g. a rejected result with no correlatable order)', async () => {
        await expect(
            service.handleOrderRegistrationResult(ctx, {
                orderUuid: null,
                orderEntityId: null,
                requestEntityId: 'req-1',
                localOrderId: null,
                rejected: true,
                reservedLines: [],
                unresolvedProductIds: [],
                documentNumber: null,
                status: '',
                rejectionReasonCode: null,
                rejectionReasonText: null,
            }),
        ).rejects.toThrow(/no Order found/);
        expect(rawQuery).not.toHaveBeenCalled();
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    // Primary correlation path (issue #204 follow-up): localOrderId resolves the order directly,
    // findOrderIdByErpId (rawQuery) never invoked.
    it('resolves the order via localOrderId when orderEntityId is absent (rejected result)', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: null,
            requestEntityId: 'req-1',
            localOrderId: 'order-1',
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
        expect(rawQuery).not.toHaveBeenCalled();
        expect(orderRepo.findOne).toHaveBeenCalledWith({ where: { id: 'order-1' } });
    });

    // Same gap also affects "registered" results (peer report, mivend.issue.199) — localOrderId
    // must resolve the order here too, proceeding to normal release-matching.
    it('resolves the order via localOrderId when orderEntityId is absent (registered result)', async () => {
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
            orderUuid: null,
            orderEntityId: null,
            requestEntityId: 'req-2',
            localOrderId: 'order-1',
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: 'ЦБАО0000001',
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(rawQuery).not.toHaveBeenCalled();
        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        expect(reservationRepo.save.mock.calls[0][0][0]).toEqual(
            expect.objectContaining({ status: 'released' }),
        );
    });

    // Regression: orderEntityId alone (localOrderId not resolved by the caller) must still work,
    // same as before this change — the fallback path.
    it('falls back to orderEntityId via findOrderIdByErpId when localOrderId is absent', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
        expect(rawQuery).toHaveBeenCalledWith(expect.stringContaining('customFieldsErporderid'), [
            'erp-order-1',
        ]);
    });

    // mivend.audit.72's LOW finding: previously this silently swallowed a plausible race (the
    // event arriving before Order.customFields.erpOrderId is set) with no retry — now it must
    // throw so the inbox's own retry/dead-letter path (not a silent, permanent skip) handles it.
    it('throws when no Order is found for orderEntityId, instead of silently skipping', async () => {
        rawQuery.mockResolvedValue([]);
        await expect(
            service.handleOrderRegistrationResult(ctx, {
                orderUuid: null,
                orderEntityId: 'erp-order-1',
                requestEntityId: null,
                localOrderId: null,
                rejected: false,
                reservedLines: [],
                unresolvedProductIds: [],
                documentNumber: null,
                status: '',
                rejectionReasonCode: null,
                rejectionReasonText: null,
            }),
        ).rejects.toThrow(/no Order found/);
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    it('never releases on a rejected result, leaving reservations active', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
        expect(reservationRepo.find).not.toHaveBeenCalled();
        expect(reservationRepo.save).not.toHaveBeenCalled();
    });

    // mivend.audit.72's HIGH finding: an unresolvable productId must be reported as its own
    // discrepancy, never treated as "not confirmed yet" (which would silently block release
    // forever with no escalation).
    it('reports an unresolved product mapping as its own discrepancy, distinct from a mismatch', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: ['unknown-prod-1'],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: ['unknown-prod-1'],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
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

    it('follows the ERP on a quantity mismatch: releases the local reservation and reports the difference', async () => {
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 3 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        expect(reservationRepo.save.mock.calls[0][0][0]).toEqual(
            expect.objectContaining({ status: 'released', releasedAt: expect.any(Date) }),
        );
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
        expect(reservationService.setOrderReservationState).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'order-1' }),
            'RELEASED',
        );
    });

    it('follows the ERP when it reserved more than we did', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 2,
                status: 'active',
            },
        ]);

        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 6 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(reservationRepo.save.mock.calls[0][0][0]).toEqual(
            expect.objectContaining({ status: 'released' }),
        );
        expect(reconciliationIssueService.reportQuantityMismatch).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ localQuantity: 2, erpQuantity: 6 }),
        );
    });

    it('follows the ERP when it reserved nothing for a line it reports (quantity absent = 0)', async () => {
        reservationRepo.find.mockResolvedValue([
            {
                id: 'res-1',
                orderId: 'order-1',
                productVariantId: 'v-1',
                quantity: 2,
                status: 'active',
            },
        ]);

        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 0 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(reservationRepo.save.mock.calls[0][0][0]).toEqual(
            expect.objectContaining({ status: 'released' }),
        );
        expect(reconciliationIssueService.reportQuantityMismatch).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ localQuantity: 2, erpQuantity: 0 }),
        );
    });

    it('releases a matching variant and a differing one together, reporting only the difference', async () => {
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
                productVariantId: 'v-2',
                quantity: 4,
                status: 'active',
            },
        ]);

        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [
                { productVariantId: 'v-1', reservedQuantity: 2 },
                { productVariantId: 'v-2', reservedQuantity: 1 },
            ],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(reservationRepo.save.mock.calls[0][0]).toHaveLength(2);
        expect(reconciliationIssueService.reportQuantityMismatch).toHaveBeenCalledTimes(1);
        expect(reconciliationIssueService.reportQuantityMismatch).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ productVariantId: 'v-2', localQuantity: 4, erpQuantity: 1 }),
        );
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        expect(reservationService.setOrderReservationState).not.toHaveBeenCalled();
    });

    // Staff need the ERP's own document number and raw status to cross-reference the order in the ERP —
    // purely informational, must never affect release/quantity-match logic below.
    it('persists documentNumber/status onto Order.customFields, even on a rejected result', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: 'ЗК-00001',
            status: 'Отклонён',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(orderRepo.update).toHaveBeenCalledWith(
            'order-1',
            expect.objectContaining({
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: 'ЗК-00002',
            status: 'Проведён',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(orderRepo.update).toHaveBeenCalledWith(
            'order-1',
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.reportQuantityMismatch).not.toHaveBeenCalled();
    });

    // Issue #204: the reason code/text get persisted and a REJECTED transition is published —
    // never written directly as erpStatus here, same separation as the ERP callback's own path.
    it('persists the rejection reason and publishes ErpOrderStatusEvent(REJECTED)', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: 'STOCK_SHORTAGE',
            rejectionReasonText: 'not enough stock',
        });

        expect(orderRepo.update).toHaveBeenCalledWith(
            'order-1',
            expect.objectContaining({
                customFields: expect.objectContaining({
                    erpRejectionReasonCode: 'STOCK_SHORTAGE',
                    erpRejectionReasonText: 'not enough stock',
                }),
            }),
        );
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ orderCode: 'order-1', status: 'REJECTED' }),
        );
    });

    // Non-terminal (issue #204): a later, non-rejected result for the same order must clear both
    // the reason fields and the REJECTED status back to SENT_TO_ERP.
    it('clears the rejection reason and erpStatus when a later result is not rejected', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            code: 'order-1',
            customFields: {
                erpStatus: 'REJECTED',
                erpRejectionReasonCode: 'STOCK_SHORTAGE',
                erpRejectionReasonText: 'not enough stock',
            },
        });

        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: 'ЗК-00003',
            status: 'Проведён',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(orderRepo.update).toHaveBeenCalledWith(
            'order-1',
            expect.objectContaining({
                customFields: expect.objectContaining({
                    erpRejectionReasonCode: null,
                    erpRejectionReasonText: null,
                }),
            }),
        );
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ orderCode: 'order-1', status: 'SENT_TO_ERP' }),
        );
    });

    // Out-of-order/stale-event guard: a result that is NOT rejected, arriving while the order is
    // NOT currently REJECTED, must never touch the reason fields or publish a status event — a
    // repeat/stale non-reject result is a safe no-op on this axis, same idempotency rule as the
    // release-matching logic above.
    it('does not touch the rejection reason or publish a status event when the order is already SENT_TO_ERP', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            code: 'order-1',
            customFields: { erpStatus: 'SENT_TO_ERP', erpOrderId: 'erp-order-1' },
        });
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: 'Проведён',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(eventBus.publish).not.toHaveBeenCalled();
        const [, { customFields }] = orderRepo.update.mock.calls[0];
        expect(customFields.erpRejectionReasonCode).toBeUndefined();
    });

    // Live finding (#204 verification): a registered result never stored erpOrderId, so every later
    // order-changed failed with "no Order found" and the order stayed PENDING.
    it('sends the order from PENDING to SENT_TO_ERP carrying orderEntityId so erpOrderId is stored', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            code: 'order-1',
            customFields: { erpStatus: 'PENDING' },
        });

        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: 'req-1',
            localOrderId: 'order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: 'ЗК-00004',
            status: 'Проведён',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                orderCode: 'order-1',
                status: 'SENT_TO_ERP',
                erpOrderId: 'erp-order-1',
            }),
        );
    });

    it('still stores a missing erpOrderId when the order is already SENT_TO_ERP', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            code: 'order-1',
            customFields: { erpStatus: 'SENT_TO_ERP' },
        });

        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: 'req-1',
            localOrderId: 'order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: 'ЗК-00006',
            status: 'Проведён',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'SENT_TO_ERP', erpOrderId: 'erp-order-1' }),
        );
    });

    it('publishes SENT_TO_ERP without an erpOrderId when the result carries no orderEntityId', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            code: 'order-1',
            customFields: { erpStatus: 'PENDING' },
        });

        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: null,
            requestEntityId: 'req-1',
            localOrderId: 'order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: 'ЗК-00005',
            status: 'Проведён',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        const event = eventBus.publish.mock.calls[0][0] as { status: string; erpOrderId?: string };
        expect(event.status).toBe('SENT_TO_ERP');
        expect(event.erpOrderId).toBeUndefined();
    });

    it('publishes REJECTED, never SENT_TO_ERP, for a rejected result on a PENDING order', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            code: 'order-1',
            customFields: { erpStatus: 'PENDING' },
        });

        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: null,
            requestEntityId: 'req-1',
            localOrderId: 'order-1',
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: 'PROCESSING_ERROR',
            rejectionReasonText: 'organization mismatch',
        });

        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({ orderCode: 'order-1', status: 'REJECTED' }),
        );
    });

    // Regression (live failure, #204): `orderRepo.save` here reproduces the real throw on an
    // unhydrated Order's calculated getters, so this fails if `.update()` reverts to `.save(order)`.
    it('persists customFields on a real, unhydrated Order entity without touching the calculated-getter save path', async () => {
        const order = loadedOrder('order-1', {});
        (order as unknown as { code: string }).code = 'order-1';
        orderRepo.findOne.mockResolvedValue(order);
        orderRepo.save.mockImplementation(async (o: unknown) => ({ ...(o as object) }));

        await expect(
            service.handleOrderRegistrationResult(ctx, {
                orderUuid: null,
                orderEntityId: 'erp-order-1',
                requestEntityId: null,
                localOrderId: null,
                rejected: false,
                reservedLines: [],
                unresolvedProductIds: [],
                documentNumber: 'ЗК-00004',
                status: 'Проведён',
                rejectionReasonCode: null,
                rejectionReasonText: null,
            }),
        ).resolves.toBeUndefined();

        expect(orderRepo.save).not.toHaveBeenCalled();
        expect(orderRepo.update).toHaveBeenCalledWith(
            'order-1',
            expect.objectContaining({
                customFields: expect.objectContaining({
                    erpRegistrationDocumentNumber: 'ЗК-00004',
                    erpRegistrationStatus: 'Проведён',
                }),
            }),
        );
    });

    // mivend#207/search-platform#180: orderUuid is now live and takes precedence over
    // localOrderId/orderEntityId — rawQuery (findOrderIdByErpId) must never be invoked when it
    // resolves the order.
    it('resolves the order via orderUuid, never touching findOrderIdByErpId', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: 'order-uuid-1',
            orderEntityId: 'erp-order-1',
            requestEntityId: 'req-1',
            localOrderId: 'order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(rawQuery).toHaveBeenCalledWith(expect.stringContaining('customFieldsUuid'), [
            'order-uuid-1',
        ]);
        expect(rawQuery).not.toHaveBeenCalledWith(
            expect.stringContaining('customFieldsErporderid'),
            expect.anything(),
        );
        expect(orderRepo.findOne).toHaveBeenCalledWith({ where: { id: 'order-1' } });
    });

    // orderUuid present but unresolvable (bad/ stale data) must throw and retry, never silently
    // fall back to localOrderId/orderEntityId — same "never a silent, permanent skip" rule as the
    // existing correlation-failure test above.
    it('throws when orderUuid is present but resolves to no Order, even if localOrderId would have worked', async () => {
        rawQuery.mockResolvedValue([]);
        await expect(
            service.handleOrderRegistrationResult(ctx, {
                orderUuid: 'unknown-order-uuid',
                orderEntityId: null,
                requestEntityId: 'req-1',
                localOrderId: 'order-1',
                rejected: false,
                reservedLines: [],
                unresolvedProductIds: [],
                documentNumber: null,
                status: '',
                rejectionReasonCode: null,
                rejectionReasonText: null,
            }),
        ).rejects.toThrow(/no Order found/);
        expect(orderRepo.findOne).not.toHaveBeenCalled();
    });

    // orderUuid absent (a result predating mivend#207) must still fall back to the existing
    // localOrderId/orderEntityId path unchanged.
    it('falls back to localOrderId when orderUuid is absent', async () => {
        await service.handleOrderRegistrationResult(ctx, {
            orderUuid: null,
            orderEntityId: null,
            requestEntityId: 'req-1',
            localOrderId: 'order-1',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });

        expect(rawQuery).not.toHaveBeenCalled();
        expect(orderRepo.findOne).toHaveBeenCalledWith({ where: { id: 'order-1' } });
    });
});

describe('ReservationWriteOffSyncService.handleOrderChanged', () => {
    let orderRepo: {
        findOne: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    let reservationRepo: {
        find: ReturnType<typeof vi.fn>;
        save: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
        query: ReturnType<typeof vi.fn>;
    };
    let rawQuery: ReturnType<typeof vi.fn>;
    let connection: {
        getRepository: ReturnType<typeof vi.fn>;
        rawConnection: { query: ReturnType<typeof vi.fn> };
        withTransaction: ReturnType<typeof vi.fn>;
    };
    let reservationService: { setOrderReservationState: ReturnType<typeof vi.fn> };
    let reconciliationIssueService: {
        reportQuantityMismatch: ReturnType<typeof vi.fn>;
        reportUnresolvedProductMapping: ReturnType<typeof vi.fn>;
    };
    let service: ReservationWriteOffSyncService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        orderErpStatus.apply.mockClear();
        orderRepo = {
            findOne: vi.fn(async () => ({ id: 'order-1', customFields: {} })),
            save: vi.fn(async (x: unknown) => x),
            update: vi.fn(async () => undefined),
        };
        reservationRepo = {
            find: vi.fn(async () => []),
            save: vi.fn(async (rows: unknown[]) => rows),
            count: vi.fn(async () => 0),
            query: vi.fn(async () => undefined),
        };
        rawQuery = vi.fn(async () => [{ id: 'order-1' }]);
        connection = {
            getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
                entity?.name === 'Order' ? orderRepo : reservationRepo,
            ),
            rawConnection: { query: rawQuery },
            withTransaction: vi.fn(async (c: unknown, work: (x: unknown) => unknown) => work(c)),
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
            { publish: vi.fn() } as never,
            orderErpStatus as never,
        );
    });

    // Cross-entity dependency rule (external-integration-rules skill): an order-changed event can
    // race ahead of local order creation — must retry, never a silent, permanent skip, same as
    // handleOrderRegistrationResult's own identical check.
    it('throws when no Order is found for orderEntityId, instead of silently skipping', async () => {
        rawQuery.mockResolvedValue([]);
        await expect(
            service.handleOrderChanged(ctx, {
                orderUuid: null,
                orderEntityId: 'erp-order-1',
                status: '',
                reservedLines: [],
                contractId: null,
                derivedStatus: null,
            }),
        ).rejects.toThrow(/no Order found/);
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    it('persists status onto Order.customFields.erpOrderStatus, never erpRegistrationStatus', async () => {
        await service.handleOrderChanged(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: 'В обработке',
            reservedLines: [],
            contractId: null,
            derivedStatus: null,
        });

        expect(orderRepo.update).toHaveBeenCalledWith(
            'order-1',
            expect.objectContaining({
                customFields: expect.objectContaining({ erpOrderStatus: 'В обработке' }),
            }),
        );
        const [, { customFields }] = orderRepo.update.mock.calls[0];
        expect(customFields.erpRegistrationStatus).toBeUndefined();
    });

    it('persists contractId when present', async () => {
        await service.handleOrderChanged(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: 'contract-guid-1',
            derivedStatus: null,
        });

        expect(orderRepo.update).toHaveBeenCalledWith(
            'order-1',
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: null,
            derivedStatus: null,
        });

        const [, { customFields }] = orderRepo.update.mock.calls[0];
        expect(customFields).not.toHaveProperty('erpContractId');
    });

    // Lost update seen live (#208): the stale snapshot's PENDING erpStatus overwrote the SENT_TO_ERP
    // written concurrently by ErpOrderService.
    it('writes only the changed fields, never a snapshot of erpStatus/erpOrderId', async () => {
        orderRepo.findOne.mockResolvedValue({
            id: 'order-1',
            customFields: { erpStatus: 'PENDING', erpOrderId: null },
        });

        await service.handleOrderChanged(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: 'X',
            reservedLines: [],
            contractId: 'c-1',
            derivedStatus: null,
        });

        const [, { customFields }] = orderRepo.update.mock.calls[0];
        expect(customFields).toEqual({ erpOrderStatus: 'X', erpContractId: 'c-1' });
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: 'Проведён',
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            contractId: null,
            derivedStatus: null,
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

    it('follows the ERP on a quantity mismatch: releases the local reservation and reports the difference', async () => {
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 3 }],
            contractId: null,
            derivedStatus: null,
        });

        expect(reservationRepo.save).toHaveBeenCalledTimes(1);
        expect(reservationRepo.save.mock.calls[0][0][0]).toEqual(
            expect.objectContaining({ status: 'released' }),
        );
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
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: 'Проведён',
            reservedLines: [{ productVariantId: 'v-1', reservedQuantity: 5 }],
            contractId: null,
            derivedStatus: null,
        });

        expect(reservationRepo.save).not.toHaveBeenCalled();
        expect(reconciliationIssueService.reportQuantityMismatch).not.toHaveBeenCalled();
    });

    // Same regression as handleOrderRegistrationResult's own test above — handleOrderChanged
    // loads the Order the same unhydrated way and must use `.update()`, never `.save(order)`.
    it('persists customFields on a real, unhydrated Order entity without touching the calculated-getter save path', async () => {
        const order = loadedOrder('order-1', {});
        orderRepo.findOne.mockResolvedValue(order);
        orderRepo.save.mockImplementation(async (o: unknown) => ({ ...(o as object) }));

        await expect(
            service.handleOrderChanged(ctx, {
                orderUuid: null,
                orderEntityId: 'erp-order-1',
                status: 'В обработке',
                reservedLines: [],
                contractId: 'contract-guid-1',
                derivedStatus: null,
            }),
        ).resolves.toBeUndefined();

        expect(orderRepo.save).not.toHaveBeenCalled();
        expect(orderRepo.update).toHaveBeenCalledWith(
            'order-1',
            expect.objectContaining({
                customFields: expect.objectContaining({
                    erpOrderStatus: 'В обработке',
                    erpContractId: 'contract-guid-1',
                }),
            }),
        );
    });

    // mivend#207/search-platform#180: order_uuid is a real optional field on OrderChanged —
    // present only for orders registered through our integration. Preferred correlation key,
    // findOrderIdByErpId never invoked when it resolves the order.
    it('resolves the order via orderUuid when present, never touching findOrderIdByErpId', async () => {
        await service.handleOrderChanged(ctx, {
            orderUuid: 'order-uuid-1',
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: null,
            derivedStatus: null,
        });

        expect(rawQuery).toHaveBeenCalledWith(expect.stringContaining('customFieldsUuid'), [
            'order-uuid-1',
        ]);
        expect(rawQuery).not.toHaveBeenCalledWith(
            expect.stringContaining('customFieldsErporderid'),
            expect.anything(),
        );
    });

    // orderUuid absent (an order not registered through our integration) must still fall back to
    // the existing orderEntityId path unchanged.
    it('falls back to orderEntityId when orderUuid is absent', async () => {
        await service.handleOrderChanged(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: null,
            derivedStatus: null,
        });

        expect(rawQuery).toHaveBeenCalledWith(expect.stringContaining('customFieldsErporderid'), [
            'erp-order-1',
        ]);
    });

    it('hands the derived status to the status service with the resolved order', async () => {
        await service.handleOrderChanged(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            status: '',
            reservedLines: [],
            contractId: null,
            derivedStatus: 'PICKING',
        });
        expect(orderErpStatus.apply).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ id: 'order-1' }),
            'PICKING',
        );
    });
});
