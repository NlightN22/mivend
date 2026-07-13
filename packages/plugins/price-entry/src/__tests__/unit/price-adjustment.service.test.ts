import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import type { OrderService, RequestContext, TransactionalConnection } from '@vendure/core';
import type { ApprovalRequestService } from '@mivend/plugin-approval-workflow';

import { PriceAdjustmentService } from '../../price-adjustment.service';
import { PriceAdjustmentGateService } from '../../price-adjustment-gate.service';

function mockCtx(permissions: string[]): RequestContext {
    return {
        userHasPermissions: (p: string[]) => p.some(x => permissions.includes(x)),
    } as unknown as RequestContext;
}

describe('PriceAdjustmentService', () => {
    let orderLineRepo: { findOneOrFail: ReturnType<typeof vi.fn> };
    let orderService: { adjustOrderLine: ReturnType<typeof vi.fn> };
    let gate: { evaluate: ReturnType<typeof vi.fn> };
    let approvalRequestService: {
        createRequest: ReturnType<typeof vi.fn>;
        decide: ReturnType<typeof vi.fn>;
    };
    let service: PriceAdjustmentService;

    beforeEach(() => {
        orderLineRepo = {
            findOneOrFail: vi.fn(async () => ({
                id: 'line-1',
                quantity: 2,
                productVariant: { id: 'variant-1' },
            })),
        };
        const connection = { getRepository: () => orderLineRepo };
        orderService = { adjustOrderLine: vi.fn(async () => ({ id: 'order-1' })) };
        gate = { evaluate: vi.fn() };
        approvalRequestService = {
            createRequest: vi.fn(async () => ({ id: 'req-1' })),
            decide: vi.fn(),
        };
        service = new PriceAdjustmentService(
            connection as unknown as TransactionalConnection,
            orderService as unknown as OrderService,
            gate as unknown as PriceAdjustmentGateService,
            approvalRequestService as unknown as ApprovalRequestService,
        );
    });

    describe('requestAdjustment', () => {
        it('applies the price directly and creates no approval request when the gate allows it', async () => {
            gate.evaluate.mockResolvedValue('apply-directly');
            const ctx = mockCtx(['AdjustPriceWithinLimit']);

            const result = await service.requestAdjustment(
                ctx,
                'order-1',
                'line-1',
                9000,
                'client haggling',
            );

            expect(result).toEqual({ decision: 'apply-directly', approvalRequestId: null });
            expect(orderService.adjustOrderLine).toHaveBeenCalledWith(ctx, 'order-1', 'line-1', 2, {
                manualUnitPrice: 9000,
                manualPriceReason: 'client haggling',
            });
            expect(approvalRequestService.createRequest).not.toHaveBeenCalled();
        });

        it('rejects apply-directly when the caller lacks AdjustPriceWithinLimit, applying nothing', async () => {
            gate.evaluate.mockResolvedValue('apply-directly');
            const ctx = mockCtx([]);

            await expect(service.requestAdjustment(ctx, 'order-1', 'line-1', 9000)).rejects.toThrow(
                ForbiddenError,
            );
            expect(orderService.adjustOrderLine).not.toHaveBeenCalled();
        });

        it('creates an ApprovalRequest instead of applying when the gate requires approval', async () => {
            gate.evaluate.mockResolvedValue('requires-approval');
            const ctx = mockCtx(['RequestPriceAdjustmentApproval']);

            const result = await service.requestAdjustment(
                ctx,
                'order-1',
                'line-1',
                100,
                'below floor',
            );

            expect(orderService.adjustOrderLine).not.toHaveBeenCalled();
            expect(approvalRequestService.createRequest).toHaveBeenCalledWith(
                ctx,
                'priceAdjustmentApproval',
                expect.objectContaining({
                    orderId: 'order-1',
                    orderLineId: 'line-1',
                    variantId: 'variant-1',
                    requestedPrice: 100,
                    justification: 'below floor',
                }),
            );
            expect(result).toEqual({ decision: 'requires-approval', approvalRequestId: 'req-1' });
        });

        it('rejects requesting approval when the caller lacks RequestPriceAdjustmentApproval', async () => {
            gate.evaluate.mockResolvedValue('requires-approval');
            const ctx = mockCtx([]);

            await expect(service.requestAdjustment(ctx, 'order-1', 'line-1', 100)).rejects.toThrow(
                ForbiddenError,
            );
            expect(approvalRequestService.createRequest).not.toHaveBeenCalled();
        });
    });

    describe('decideAndApply', () => {
        it('applies the price once the priceAdjustmentApproval request becomes approved', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'approved',
                requestType: 'priceAdjustmentApproval',
                payload: JSON.stringify({
                    orderId: 'order-1',
                    orderLineId: 'line-1',
                    variantId: 'variant-1',
                    requestedPrice: 100,
                    justification: 'below floor',
                }),
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'approved', 'ok');

            expect(orderService.adjustOrderLine).toHaveBeenCalledWith(ctx, 'order-1', 'line-1', 2, {
                manualUnitPrice: 100,
                manualPriceReason: 'below floor',
            });
        });

        it('does not apply anything when the request is rejected', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-1',
                status: 'rejected',
                requestType: 'priceAdjustmentApproval',
                payload: '{}',
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-1', 'rejected');

            expect(orderService.adjustOrderLine).not.toHaveBeenCalled();
        });

        it('does not apply anything for a different requestType, never assuming price-adjustment shape', async () => {
            approvalRequestService.decide.mockResolvedValue({
                id: 'req-2',
                status: 'approved',
                requestType: 'discountGrantApproval',
                payload: '{}',
            });
            const ctx = mockCtx(['ApproveDiscountRequest']);

            await service.decideAndApply(ctx, 'req-2', 'approved');

            expect(orderService.adjustOrderLine).not.toHaveBeenCalled();
        });
    });
});
