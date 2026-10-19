import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderRegistrationResultHandler } from '../../handlers/order-registration-result.handler';
import { MissingDependencyError } from '../../types';

// Routes each query by table name, not call order, so tests may set up
// 'product_variant' and 'integration_outbox' lookups independently of each other.
function createConnection(options: {
    variantRows?: Array<Record<string, unknown> | undefined>;
    outboxOrderId?: string | null;
}): {
    getRepository: () => { query: (sql: string) => Promise<unknown[]> };
} {
    const variantRows = options.variantRows ?? [];
    const outboxOrderId = options.outboxOrderId ?? null;
    let variantCall = 0;
    const query = async (sql: string): Promise<unknown[]> => {
        if (sql.includes('integration_outbox')) {
            return outboxOrderId != null ? [{ orderId: outboxOrderId }] : [];
        }
        const row = variantRows[variantCall];
        variantCall += 1;
        return row ? [row] : [];
    };
    return { getRepository: () => ({ query }) };
}

describe('OrderRegistrationResultHandler', () => {
    const ctx = {} as RequestContext;

    it('skips a deleted event without calling the sync service', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', { isDeleted: true });

        expect(syncService.handleOrderRegistrationResult).not.toHaveBeenCalled();
    });

    it('passes rejected=true and no reservedLines when businessRejectionReason is present', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        const outcome = await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            businessRejectionReason: { code: 'X', message: 'nope' },
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: null,
            status: '',
            rejectionReasonCode: 'X',
            rejectionReasonText: 'nope',
        });
        // Issue #204: a business rejection must not count as a silent `applied` — it is visible
        // on the Integration health page's No-op column, with the reason as its tooltip.
        expect(outcome).toEqual({
            kind: 'noop',
            reason: expect.stringContaining('rejected by the ERP'),
        });
    });

    it('resolves reservedLines productId to a ProductVariant id', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ variantRows: [{ id: 'variant-1' }] }) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [{ productId: 'prod-1', reservedQuantity: 3.4 }],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 3 }],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    it('passes the variant id as a string even though Postgres returns the integer id as a number', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ variantRows: [{ id: 27708 }] }) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [{ productId: 'prod-1' }],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                reservedLines: [{ productVariantId: '27708', reservedQuantity: 0 }],
            }),
        );
    });

    // An unresolved productId is an eventual-consistency race, so throw MissingDependencyError
    // to retry with backoff; a truly stale mapping surfaces as inbox 'failed' after the 24h budget.
    it('throws MissingDependencyError for a line whose productId does not resolve to a known variant', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ variantRows: [undefined] }) as never,
            syncService as never,
        );

        await expect(
            handler.apply(ctx, 'orr-1', {
                orderEntityId: 'erp-order-1',
                reservedLines: [{ productId: 'unknown-prod', reservedQuantity: 1 }],
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(syncService.handleOrderRegistrationResult).not.toHaveBeenCalled();
    });

    // reservedQuantity is a non-optional proto3 double, so an absent key means 0 (a zeroed line),
    // not a malformed line; do not default it to NaN and drop the line.
    it('applies a line with an absent reservedQuantity as an explicit 0, not a dropped line', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ variantRows: [{ id: 'variant-1' }] }) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [{ productId: 'prod-1' }],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 0 }],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    it('drops (and does not report) a line with a missing productId', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [{ productId: '', reservedQuantity: 1 }],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            linesDiscarded: true,
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    it('passes orderEntityId=null through untouched when absent', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            businessRejectionReason: { code: 'X', message: 'no order created' },
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: null,
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: null,
            status: '',
            rejectionReasonCode: 'X',
            rejectionReasonText: 'no order created',
        });
    });

    // BusinessRejectionReason.code/message are both plain proto3 strings — an absent key within
    // the object means '' (zero-value-omission rule), not null, same as top-level status.
    it('treats an absent code/message on businessRejectionReason as empty strings, not null', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            businessRejectionReason: {},
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ rejectionReasonCode: '', rejectionReasonText: '' }),
        );
    });

    // documentNumber is a real proto `optional string` (null when genuinely absent); status is a
    // plain proto3 string (zero-value-omission rule applies — absent means '').
    it('extracts documentNumber and status, and treats status absent as the empty string', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            documentNumber: 'ЗК-00001',
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: 'ЗК-00001',
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    // Issue #204 follow-up: a rejected result never carries orderEntityId — requestEntityId must
    // be extracted and resolved against integration_outbox regardless.
    it('resolves localOrderId via requestEntityId on a rejected result with no orderEntityId', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ outboxOrderId: 'order-7' }) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            requestEntityId: 'req-1',
            businessRejectionReason: { code: 'PROCESSING_ERROR', message: 'nope' },
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: null,
            requestEntityId: 'req-1',
            localOrderId: 'order-7',
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: null,
            status: '',
            rejectionReasonCode: 'PROCESSING_ERROR',
            rejectionReasonText: 'nope',
        });
    });

    // #218: the ERP's real foreign-unit refusal — rejected before any document exists, so no
    // orderEntityId/documentNumber, and the reason text must reach the order intact.
    it('carries the ERP foreign-unit PROCESSING_ERROR text through with no document or order id', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ outboxOrderId: 'order-7' }) as never,
            syncService as never,
        );
        const message = 'Unit unitId=unit-b is not owned by product Sealant 320ml.';

        await handler.apply(ctx, 'orr-2', {
            status: 'rejected',
            requestEntityId: 'order-uuid-7',
            businessRejectionReason: { code: 'PROCESSING_ERROR', message },
            reservedLines: [],
            isDeleted: false,
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                rejected: true,
                orderEntityId: null,
                documentNumber: null,
                localOrderId: 'order-7',
                reservedLines: [],
                rejectionReasonCode: 'PROCESSING_ERROR',
                rejectionReasonText: message,
            }),
        );
    });

    // Same gap currently affects "registered" results too (peer report, mivend.issue.199) —
    // requestEntityId must resolve localOrderId here as well, independent of orderEntityId.
    it('resolves localOrderId via requestEntityId on a registered result with no orderEntityId', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ outboxOrderId: 'order-7' }) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            requestEntityId: 'req-2',
            documentNumber: 'DOC-0001',
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: null,
            requestEntityId: 'req-2',
            localOrderId: 'order-7',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: 'DOC-0001',
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    // Regression: when orderEntityId IS present, it is still extracted and passed through even
    // if requestEntityId also resolves — the sync service decides which one wins.
    it('still extracts orderEntityId when present, alongside a resolved localOrderId', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ outboxOrderId: 'order-7' }) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            requestEntityId: 'req-3',
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: 'req-3',
            localOrderId: 'order-7',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    // Neither key resolves (outbox row not found, e.g. a genuine race or data gap) — localOrderId
    // stays null; it is the sync service's job to then throw rather than silently skip.
    it('passes localOrderId=null through when requestEntityId does not resolve in integration_outbox', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({ outboxOrderId: null }) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            requestEntityId: 'req-unknown',
            businessRejectionReason: { code: 'PROCESSING_ERROR', message: 'nope' },
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({
                orderEntityId: null,
                requestEntityId: 'req-unknown',
                localOrderId: null,
            }),
        );
    });

    it('passes status through verbatim when present', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            status: 'Проведён',
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(ctx, {
            orderUuid: null,
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
            linesDiscarded: false,
            documentNumber: null,
            status: 'Проведён',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    // mivend#207/search-platform#180: order_uuid is now live on OrderRegistrationResult.
    it('extracts orderUuid and passes it through alongside the fallback keys', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderUuid: 'order-uuid-1',
            orderEntityId: 'erp-order-1',
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ orderUuid: 'order-uuid-1' }),
        );
    });

    // order_uuid is a plain (non-optional) proto3 string — an absent key decodes to '', which
    // must be treated as "no correlation key", not a literal empty-string uuid.
    it('treats an absent orderUuid as null, not an empty string, for results predating the field', async () => {
        const syncService = { handleOrderRegistrationResult: vi.fn() };
        const handler = new OrderRegistrationResultHandler(
            createConnection({}) as never,
            syncService as never,
        );

        await handler.apply(ctx, 'orr-1', {
            orderEntityId: 'erp-order-1',
            reservedLines: [],
        });

        expect(syncService.handleOrderRegistrationResult).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ orderUuid: null }),
        );
    });
});
