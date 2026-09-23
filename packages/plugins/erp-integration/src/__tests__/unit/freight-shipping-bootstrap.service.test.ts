import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProcessContext, ShippingMethodService, TransactionalConnection } from '@vendure/core';

import {
    FreightShippingBootstrapService,
    FREIGHT_SHIPPING_METHOD_CODE,
} from '../../freight-shipping-bootstrap.service';

function createMockRepo() {
    return {
        findOne: vi.fn(),
    };
}

describe('FreightShippingBootstrapService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let connection: { getRepository: (...args: unknown[]) => ReturnType<typeof createMockRepo> };
    let shippingMethodService: { create: ReturnType<typeof vi.fn> };
    let processContext: { isWorker: boolean };
    let service: FreightShippingBootstrapService;

    beforeEach(() => {
        repo = createMockRepo();
        connection = { getRepository: () => repo };
        shippingMethodService = { create: vi.fn().mockResolvedValue({ id: 1 }) };
        processContext = { isWorker: false };
        service = new FreightShippingBootstrapService(
            connection as unknown as TransactionalConnection,
            shippingMethodService as unknown as ShippingMethodService,
            processContext as unknown as ProcessContext,
        );
    });

    it('does nothing on the worker process', async () => {
        processContext.isWorker = true;
        await service.onApplicationBootstrap();
        expect(shippingMethodService.create).not.toHaveBeenCalled();
    });

    it('creates the shipping method when it does not exist yet', async () => {
        repo.findOne.mockResolvedValue(null);
        await service.onApplicationBootstrap();

        expect(shippingMethodService.create).toHaveBeenCalledTimes(1);
        const input = shippingMethodService.create.mock.calls[0][1] as {
            code: string;
            checker: { code: string };
            calculator: { code: string };
            fulfillmentHandler: string;
        };
        expect(input.code).toBe(FREIGHT_SHIPPING_METHOD_CODE);
        expect(input.checker.code).toBe('default-shipping-eligibility-checker');
        expect(input.calculator.code).toBe('default-shipping-calculator');
        expect(input.fulfillmentHandler).toBe('manual-fulfillment');
    });

    it('is idempotent: does not create a duplicate when the shipping method already exists', async () => {
        repo.findOne.mockResolvedValue({ id: 1, code: FREIGHT_SHIPPING_METHOD_CODE });
        await service.onApplicationBootstrap();

        expect(shippingMethodService.create).not.toHaveBeenCalled();
    });

    it('swallows a provisioning failure rather than crashing bootstrap', async () => {
        repo.findOne.mockRejectedValue(new Error('db down'));
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
});
