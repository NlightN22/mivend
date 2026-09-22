import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
    ChannelService,
    PaymentMethodService,
    ProcessContext,
    TransactionalConnection,
} from '@vendure/core';

import { DeferredPaymentBootstrapService } from '../../deferred-payment-bootstrap.service';
import { DEFERRED_PAYMENT_METHOD_CODE } from '../../deferred-payment-handler';

function createMockRepo() {
    return {
        findOne: vi.fn(),
    };
}

describe('DeferredPaymentBootstrapService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let connection: { getRepository: (...args: unknown[]) => ReturnType<typeof createMockRepo> };
    let channelService: { getDefaultChannel: ReturnType<typeof vi.fn> };
    let paymentMethodService: { create: ReturnType<typeof vi.fn> };
    let processContext: { isWorker: boolean };
    let service: DeferredPaymentBootstrapService;

    beforeEach(() => {
        repo = createMockRepo();
        connection = { getRepository: () => repo };
        channelService = {
            getDefaultChannel: vi.fn().mockResolvedValue({ id: 1, code: '__default_channel__' }),
        };
        paymentMethodService = { create: vi.fn().mockResolvedValue({ id: 1 }) };
        processContext = { isWorker: false };
        service = new DeferredPaymentBootstrapService(
            connection as unknown as TransactionalConnection,
            channelService as unknown as ChannelService,
            paymentMethodService as unknown as PaymentMethodService,
            processContext as unknown as ProcessContext,
        );
    });

    it('does nothing on the worker process', async () => {
        processContext.isWorker = true;
        await service.onApplicationBootstrap();
        expect(paymentMethodService.create).not.toHaveBeenCalled();
    });

    it('creates the payment method when it does not exist yet', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.onApplicationBootstrap();

        expect(paymentMethodService.create).toHaveBeenCalledTimes(1);
        const input = paymentMethodService.create.mock.calls[0][1] as {
            code: string;
            handler: { code: string };
        };
        expect(input.code).toBe(DEFERRED_PAYMENT_METHOD_CODE);
        expect(input.handler.code).toBe(DEFERRED_PAYMENT_METHOD_CODE);
    });

    it('is idempotent: does not create a duplicate when the payment method already exists', async () => {
        repo.findOne.mockResolvedValue({ id: 1, code: DEFERRED_PAYMENT_METHOD_CODE });
        await service.onApplicationBootstrap();

        expect(paymentMethodService.create).not.toHaveBeenCalled();
    });

    it('swallows a provisioning failure rather than crashing bootstrap', async () => {
        repo.findOne.mockRejectedValue(new Error('db down'));
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
});
