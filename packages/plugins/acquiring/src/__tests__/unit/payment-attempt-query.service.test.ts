import { RequestContext, TransactionalConnection } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { PaymentAttemptQueryService } from '../../payment-attempt-query.service';

const mockCtx = {} as unknown as RequestContext;

function makeProformaInvoice(overrides: Partial<ProformaInvoice> = {}): ProformaInvoice {
    return {
        id: 1,
        orderId: 10,
        organizationId: 1,
        counterpartyId: 5,
        amount: 5000,
        currencyCode: 'RUB',
        status: 'issued',
        ...overrides,
    } as ProformaInvoice;
}

describe('PaymentAttemptQueryService', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function createMockQb() {
        const qb = {
            innerJoin: vi.fn(),
            where: vi.fn(),
            andWhere: vi.fn(),
            orderBy: vi.fn(),
            addOrderBy: vi.fn(),
            take: vi.fn(),
            skip: vi.fn(),
            getManyAndCount: vi.fn(),
        };
        qb.innerJoin.mockReturnValue(qb);
        qb.where.mockReturnValue(qb);
        qb.andWhere.mockReturnValue(qb);
        qb.orderBy.mockReturnValue(qb);
        qb.addOrderBy.mockReturnValue(qb);
        qb.take.mockReturnValue(qb);
        qb.skip.mockReturnValue(qb);
        return qb;
    }

    it('findForCounterparty scopes payments by counterparty via a join through ProformaInvoice', async () => {
        const qb = createMockQb();
        qb.getManyAndCount.mockResolvedValue([[{ id: 1 }], 1]);
        const mockConnection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb), find: vi.fn() })),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptQueryService(mockConnection);

        const result = await service.findForCounterparty(mockCtx, '5', { take: 10, skip: 0 });

        expect(qb.where).toHaveBeenCalledWith('proformaInvoice.counterpartyId = :counterpartyId', {
            counterpartyId: 5,
        });
        expect(result).toEqual({ items: [{ id: 1 }], totalItems: 1 });
    });

    it('findForCounterparty applies the "status" filter option to paymentStatus (must match the GraphQL PaymentListOptions.status field name exactly, not a renamed TS property)', async () => {
        const qb = createMockQb();
        qb.getManyAndCount.mockResolvedValue([[], 0]);
        const mockConnection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb), find: vi.fn() })),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptQueryService(mockConnection);

        await service.findForCounterparty(mockCtx, '5', { status: 'captured' });

        expect(qb.andWhere).toHaveBeenCalledWith('payment.paymentStatus = :paymentStatus', {
            paymentStatus: 'captured',
        });
    });

    it('findForCounterparty applies the channel filter option', async () => {
        const qb = createMockQb();
        qb.getManyAndCount.mockResolvedValue([[], 0]);
        const mockConnection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb), find: vi.fn() })),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptQueryService(mockConnection);

        await service.findForCounterparty(mockCtx, '5', { channel: 'bank-transfer-erp' });

        expect(qb.andWhere).toHaveBeenCalledWith('payment.channel = :channel', {
            channel: 'bank-transfer-erp',
        });
    });

    it('findForCounterparty applies search as a substring match against the payment number', async () => {
        const qb = createMockQb();
        qb.getManyAndCount.mockResolvedValue([[], 0]);
        const mockConnection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb), find: vi.fn() })),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptQueryService(mockConnection);

        await service.findForCounterparty(mockCtx, '5', { search: 'RRN-123' });

        expect(qb.andWhere).toHaveBeenCalledWith('payment.number ILIKE :search', {
            search: '%RRN-123%',
        });
    });

    it('belongsToCounterparty is false when the payment has no proformaInvoiceId', async () => {
        const mockConnection = {
            getRepository: vi.fn(),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptQueryService(mockConnection);

        const owned = await service.belongsToCounterparty(
            mockCtx,
            { proformaInvoiceId: null } as never,
            5,
        );

        expect(owned).toBe(false);
    });

    it("belongsToCounterparty matches the proforma invoice's counterpartyId", async () => {
        const mockProformaInvoiceRepo = {
            findOne: vi.fn(async () => makeProformaInvoice({ counterpartyId: 5 })),
        };
        const mockConnection = {
            getRepository: vi.fn(() => mockProformaInvoiceRepo),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptQueryService(mockConnection);

        expect(
            await service.belongsToCounterparty(mockCtx, { proformaInvoiceId: 1 } as never, 5),
        ).toBe(true);
        expect(
            await service.belongsToCounterparty(mockCtx, { proformaInvoiceId: 1 } as never, 9),
        ).toBe(false);
    });

    it('getAllocationsForPayment joins each SettlementEntry to its proforma invoice, with null for the advance row', async () => {
        const entries = [
            { id: 1, proformaInvoiceId: 2, sourcePaymentId: 99, amount: 3000 },
            { id: 2, proformaInvoiceId: null, sourcePaymentId: 99, amount: 1500 },
        ];
        const mockSettlementRepo = { find: vi.fn(async () => entries) };
        const mockProformaInvoiceRepo = {
            findOne: vi.fn(async () => makeProformaInvoice({ id: 2 })),
        };
        const mockConnection = {
            getRepository: vi.fn((_ctx, entity) =>
                entity === ProformaInvoice ? mockProformaInvoiceRepo : mockSettlementRepo,
            ),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptQueryService(mockConnection);

        const allocations = await service.getAllocationsForPayment(mockCtx, 99);

        expect(allocations).toHaveLength(2);
        expect(allocations[0].proformaInvoice).toEqual(makeProformaInvoice({ id: 2 }));
        expect(allocations[1].proformaInvoice).toBeNull();
    });

    describe('sumCapturedAmountsByOrderIds', () => {
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        function createMockAggregateQb() {
            const qb = {
                select: vi.fn(),
                addSelect: vi.fn(),
                where: vi.fn(),
                andWhere: vi.fn(),
                groupBy: vi.fn(),
                getRawMany: vi.fn(),
            };
            qb.select.mockReturnValue(qb);
            qb.addSelect.mockReturnValue(qb);
            qb.where.mockReturnValue(qb);
            qb.andWhere.mockReturnValue(qb);
            qb.groupBy.mockReturnValue(qb);
            return qb;
        }

        it('returns an empty map without querying when given no orderIds', async () => {
            const mockConnection = {
                getRepository: vi.fn(),
            } as unknown as TransactionalConnection;
            const service = new PaymentAttemptQueryService(mockConnection);

            const result = await service.sumCapturedAmountsByOrderIds(mockCtx, []);

            expect(result.size).toBe(0);
            expect(mockConnection.getRepository).not.toHaveBeenCalled();
        });

        it('sums only captured payments, grouped per orderId — an authorized-but-not-yet-captured or failed attempt must never count as money received', async () => {
            const qb = createMockAggregateQb();
            qb.getRawMany.mockResolvedValue([
                { orderId: 10, capturedAmount: '5000' },
                { orderId: 11, capturedAmount: '1250' },
            ]);
            const mockConnection = {
                getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb) })),
            } as unknown as TransactionalConnection;
            const service = new PaymentAttemptQueryService(mockConnection);

            const result = await service.sumCapturedAmountsByOrderIds(mockCtx, [10, 11, 12]);

            expect(qb.andWhere).toHaveBeenCalledWith('payment.paymentStatus = :status', {
                status: 'captured',
            });
            expect(result.get(10)).toBe(5000);
            expect(result.get(11)).toBe(1250);
            // Absent key means no captured rows, not a zero entry; callers must not assume the key exists.
            // AdminPaymentVisibilityResolver.orderPaymentSummaries converts absent to a displayed 0.
            expect(result.has(12)).toBe(false);
        });
    });
});
