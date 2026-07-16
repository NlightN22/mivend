import { EntityHydrator, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Invoice } from '../../entities/invoice.entity';
import { InvoiceService } from '../../invoice.service';

const mockRepo = {
    find: vi.fn(),
    create: vi.fn((input: Partial<Invoice>) => ({ ...input }) as Invoice),
    save: vi.fn(async (entities: Invoice[]) => entities),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
} as unknown as TransactionalConnection;

const mockEntityHydrator = { hydrate: vi.fn() };
const mockCounterpartyService = { getForCustomer: vi.fn() };

const mockCtx = {} as unknown as RequestContext;

function makeOrder(
    lines: Array<{ organizationId: number | null; linePriceWithTax: number; sku?: string }>,
): Order {
    return {
        id: 1,
        currencyCode: 'RUB',
        customer: { id: 'cust-1' },
        lines: lines.map((line, i) => ({
            id: `line-${i}`,
            linePriceWithTax: line.linePriceWithTax,
            productVariant: {
                sku: line.sku ?? `sku-${i}`,
                customFields: { organizationId: line.organizationId },
            },
        })),
    } as unknown as Order;
}

describe('InvoiceService', () => {
    let service: InvoiceService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new InvoiceService(
            mockConnection,
            mockEntityHydrator as unknown as EntityHydrator,
            mockCounterpartyService as unknown as CounterpartyService,
        );
    });

    describe('computeSplit', () => {
        it('groups order lines by organizationId and sums amounts', async () => {
            const order = makeOrder([
                { organizationId: 1, linePriceWithTax: 1000 },
                { organizationId: 2, linePriceWithTax: 500 },
                { organizationId: 1, linePriceWithTax: 300 },
            ]);

            const split = await service.computeSplit(mockCtx, order);

            expect(split).toEqual(
                expect.arrayContaining([
                    { organizationId: 1, amount: 1300 },
                    { organizationId: 2, amount: 500 },
                ]),
            );
            expect(split).toHaveLength(2);
        });

        it('throws when a line has no organizationId', async () => {
            const order = makeOrder([{ organizationId: null, linePriceWithTax: 1000 }]);

            await expect(service.computeSplit(mockCtx, order)).rejects.toThrow(
                /has no organizationId set/,
            );
        });
    });

    describe('createInvoicesForOrder', () => {
        it('creates one Invoice per organization and resolves the counterparty', async () => {
            mockRepo.find.mockResolvedValue([]);
            mockCounterpartyService.getForCustomer.mockResolvedValue({ id: '42' });
            const order = makeOrder([
                { organizationId: 1, linePriceWithTax: 1000 },
                { organizationId: 2, linePriceWithTax: 500 },
            ]);

            const invoices = await service.createInvoicesForOrder(mockCtx, order);

            expect(invoices).toHaveLength(2);
            expect(mockCounterpartyService.getForCustomer).toHaveBeenCalledWith(mockCtx, 'cust-1');
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        organizationId: 1,
                        amount: 1000,
                        counterpartyId: 42,
                    }),
                    expect.objectContaining({ organizationId: 2, amount: 500, counterpartyId: 42 }),
                ]),
            );
        });

        it('is idempotent — returns existing invoices instead of creating duplicates', async () => {
            const existing = [{ id: 1, orderId: 1 } as Invoice];
            mockRepo.find.mockResolvedValue(existing);
            const order = makeOrder([{ organizationId: 1, linePriceWithTax: 1000 }]);

            const invoices = await service.createInvoicesForOrder(mockCtx, order);

            expect(invoices).toBe(existing);
            expect(mockRepo.save).not.toHaveBeenCalled();
            expect(mockCounterpartyService.getForCustomer).not.toHaveBeenCalled();
        });

        it('throws when the order has no counterparty', async () => {
            mockRepo.find.mockResolvedValue([]);
            mockCounterpartyService.getForCustomer.mockResolvedValue(null);
            const order = makeOrder([{ organizationId: 1, linePriceWithTax: 1000 }]);

            await expect(service.createInvoicesForOrder(mockCtx, order)).rejects.toThrow(
                /has no counterparty/,
            );
        });
    });
});
