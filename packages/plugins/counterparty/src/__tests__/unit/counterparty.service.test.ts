import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CustomerService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import type { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { CounterpartyService } from '../../counterparty.service';
import { Counterparty } from '../../entities/counterparty.entity';

const mockRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    find: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
    rawConnection: { query: vi.fn() },
};

const mockCustomerService = {
    update: vi.fn(async () => ({})),
} as unknown as CustomerService;

const mockCustomerPricingService = {
    assignCustomerPriceTypeByCode: vi.fn(async () => ({})),
} as unknown as CustomerPricingService;

const mockCtx = {} as unknown as RequestContext;

describe('CounterpartyService', () => {
    let service: CounterpartyService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new CounterpartyService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService,
            mockCustomerPricingService,
        );
    });

    describe('setCustomerCounterparty', () => {
        it('assigns the counterparty priceType via CustomerPricingService', async () => {
            mockRepo.findOne.mockResolvedValue({
                id: 'cp-1',
                erpId: 'erp-1',
                priceType: 'WHOLESALE',
            } as Counterparty);

            await service.setCustomerCounterparty(mockCtx, 'cust-1', 'erp-1');

            expect(mockCustomerService.update).toHaveBeenCalledWith(
                mockCtx,
                expect.objectContaining({ id: 'cust-1' }),
            );
            expect(mockCustomerPricingService.assignCustomerPriceTypeByCode).toHaveBeenCalledWith(
                mockCtx,
                'cust-1',
                'WHOLESALE',
            );
        });

        it('throws when the counterparty is not found', async () => {
            mockRepo.findOne.mockResolvedValue(null);

            await expect(
                service.setCustomerCounterparty(mockCtx, 'cust-1', 'missing-erp'),
            ).rejects.toThrow(UserInputError);
            expect(mockCustomerPricingService.assignCustomerPriceTypeByCode).not.toHaveBeenCalled();
        });
    });
});
