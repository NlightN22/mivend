import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderRegistrationResultHandler } from '../../handlers/order-registration-result.handler';
import { MissingDependencyError } from '../../types';

// Each call to createQueryBuilder() routes by table name (variant lookup uses 'product_variant',
// the requestEntityId->orderId lookup uses 'integration_outbox') so tests can set up either/both
// independently of call order.
function createConnection(options: {
    variantRows?: Array<Record<string, unknown> | undefined>;
    outboxOrderId?: string | null;
}): {
    rawConnection: { createQueryBuilder: () => unknown };
} {
    const variantRows = options.variantRows ?? [];
    const outboxOrderId = options.outboxOrderId ?? null;
    let variantCall = 0;
    return {
        rawConnection: {
            createQueryBuilder: () => {
                let fromTable = '';
                const builder = {
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn((table: string) => {
                        fromTable = table;
                        return builder;
                    }),
                    innerJoin: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    getRawOne: vi.fn(() => {
                        if (fromTable === 'integration_outbox') {
                            return Promise.resolve(
                                outboxOrderId != null ? { orderId: outboxOrderId } : undefined,
                            );
                        }
                        const row = variantRows[variantCall];
                        variantCall += 1;
                        return Promise.resolve(row);
                    }),
                };
                return builder;
            },
        },
    };
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
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
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
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 3 }],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: null,
            rejectionReasonText: null,
        });
    });

    // Issue #96: a productId that doesn't resolve yet is an ordinary eventual-consistency race
    // (the product stream may simply not have been consumed yet) — this now throws
    // MissingDependencyError so processOne() retries with backoff instead of the previous
    // behavior (mivend.audit.72) of reporting it immediately as a permanent reconciliation issue
    // on the very first attempt. A genuinely stale mapping still surfaces visibly once the 24h
    // wall-clock retry budget is exhausted (inbox 'failed', not silent).
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

    // mivend.issue.84.88: `reservedQuantity` is a plain (non-optional) proto3 double — an absent
    // key means reservedQuantity=0 (a fully-cancelled/zeroed line), not a malformed line. A prior
    // revision defaulted the missing key to NaN and dropped the whole line.
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
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [{ productVariantId: 'variant-1', reservedQuantity: 0 }],
            unresolvedProductIds: [],
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
            orderEntityId: null,
            requestEntityId: null,
            localOrderId: null,
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
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
            orderEntityId: 'erp-order-1',
            requestEntityId: null,
            localOrderId: null,
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
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
            orderEntityId: null,
            requestEntityId: 'req-1',
            localOrderId: 'order-7',
            rejected: true,
            reservedLines: [],
            unresolvedProductIds: [],
            documentNumber: null,
            status: '',
            rejectionReasonCode: 'PROCESSING_ERROR',
            rejectionReasonText: 'nope',
        });
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
            orderEntityId: null,
            requestEntityId: 'req-2',
            localOrderId: 'order-7',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
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
            orderEntityId: 'erp-order-1',
            requestEntityId: 'req-3',
            localOrderId: 'order-7',
            rejected: false,
            reservedLines: [],
            unresolvedProductIds: [],
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
    });
});
