import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Invoice } from '../../entities/invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { InvoiceService } from '../../invoice.service';
import { SettlementEntryService } from '../../settlement-entry.service';

const mockCtx = {} as unknown as RequestContext;

function makeInvoice(overrides: Partial<Invoice>): Invoice {
    return {
        id: 1,
        orderId: 10,
        organizationId: 1,
        counterpartyId: 5,
        amount: 5000,
        currencyCode: 'RUB',
        status: 'issued',
        ...overrides,
    } as Invoice;
}

function makePaymentAttempt(overrides: Partial<PaymentAttempt>): PaymentAttempt {
    return {
        id: 99,
        invoiceId: 1,
        orderId: 10,
        amount: 5000,
        currencyCode: 'RUB',
        channel: 'online-acquiring',
        paymentStatus: 'captured',
        erpPostingStatus: 'notRequired',
        providerPaymentId: null,
        ...overrides,
    } as PaymentAttempt;
}

describe('SettlementEntryService.allocate', () => {
    let service: SettlementEntryService;
    let mockInvoiceService: {
        findOne: ReturnType<typeof vi.fn>;
        updateStatus: ReturnType<typeof vi.fn>;
    };
    let mockInvoiceRepo: ReturnType<typeof createMockInvoiceRepo>;
    let mockSettlementRepo: ReturnType<typeof createMockSettlementRepo>;
    let mockConnection: TransactionalConnection;
    let scanQb: ReturnType<typeof createChainableQb>;
    let preferredQb: ReturnType<typeof createChainableQb>;

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
    function createChainableQb(result: unknown) {
        const qb = {
            where: vi.fn(),
            andWhere: vi.fn(),
            orderBy: vi.fn(),
            take: vi.fn(),
            setLock: vi.fn(),
            getMany: vi.fn(async () => result),
            getOne: vi.fn(async () => result),
        };
        qb.where.mockReturnValue(qb);
        qb.andWhere.mockReturnValue(qb);
        qb.orderBy.mockReturnValue(qb);
        qb.take.mockReturnValue(qb);
        qb.setLock.mockReturnValue(qb);
        return qb;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function createMockInvoiceRepo(openInvoices: Invoice[], findOneResult: Invoice | null = null) {
        scanQb = createChainableQb(openInvoices);
        preferredQb = createChainableQb(findOneResult);
        let call = 0;
        return {
            createQueryBuilder: vi.fn(() => {
                call += 1;
                // First createQueryBuilder call is always the bounded FIFO scan; a second call
                // only happens for the "fetch the preferred invoice directly" fallback path.
                return call === 1 ? scanQb : preferredQb;
            }),
        };
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function createMockSettlementRepo() {
        return {
            create: vi.fn(input => input),
            save: vi.fn(async (entity: unknown) => ({ ...(entity as object), id: Math.random() })),
        };
    }

    function setup(openInvoices: Invoice[], findOneResult: Invoice | null = null): void {
        mockInvoiceRepo = createMockInvoiceRepo(openInvoices, findOneResult);
        mockSettlementRepo = createMockSettlementRepo();
        mockConnection = {
            getRepository: vi.fn((_ctx, entity) => {
                return entity === Invoice ? mockInvoiceRepo : mockSettlementRepo;
            }),
        } as unknown as TransactionalConnection;
        service = new SettlementEntryService(
            mockConnection,
            mockInvoiceService as unknown as InvoiceService,
        );
    }

    beforeEach(() => {
        mockInvoiceService = { findOne: vi.fn(), updateStatus: vi.fn() };
    });

    it('fully settles the target invoice when the payment amount exactly covers it', async () => {
        const target = makeInvoice({ id: 1, amount: 5000 });
        mockInvoiceService.findOne.mockResolvedValue(target);
        setup([target]);

        const entries = await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000 }));

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ invoiceId: 1, allocationAmount: 5000 });
        expect(mockInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 1, 'paid');
    });

    it("FIFOs any remainder to the counterparty/organization's other open invoices, oldest first", async () => {
        const target = makeInvoice({ id: 1, amount: 3000 });
        const older = makeInvoice({ id: 2, amount: 2000 });
        mockInvoiceService.findOne.mockResolvedValue(target);
        setup([target, older]);

        const entries = await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000 }));

        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ invoiceId: 1, allocationAmount: 3000 });
        expect(entries[1]).toMatchObject({ invoiceId: 2, allocationAmount: 2000 });
        expect(mockInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 1, 'paid');
        expect(mockInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 2, 'paid');
    });

    it('records the unallocatable remainder as an advance (invoiceId null) when every open invoice is covered', async () => {
        const target = makeInvoice({ id: 1, amount: 3000 });
        mockInvoiceService.findOne.mockResolvedValue(target);
        setup([target]);

        const entries = await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000 }));

        expect(entries).toHaveLength(2);
        expect(entries[1]).toMatchObject({ invoiceId: null, allocatedOrderId: null, amount: 2000 });
    });

    it('a second "success" payment against an already-paid target invoice never touches it again, and flows entirely to the next open invoice (double-payment / duplicate-channel scenario)', async () => {
        // target invoice is already paid — the open-invoices query naturally excludes it (only
        // pending/issued are fetched), so the second capture never marks it "paid" a second time.
        const other = makeInvoice({ id: 2, amount: 4000 });
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ id: 1, status: 'paid' }));
        setup([other]); // the already-paid target invoice is not in the "open" set at all

        const entries = await service.allocate(
            mockCtx,
            makePaymentAttempt({ invoiceId: 1, amount: 5000 }),
        );

        expect(mockInvoiceService.updateStatus).not.toHaveBeenCalledWith(mockCtx, 1, 'paid');
        expect(entries[0]).toMatchObject({ invoiceId: 2, allocationAmount: 4000 });
        expect(entries[1]).toMatchObject({ invoiceId: null, amount: 1000 });
    });

    it('a duplicate payment with nothing else open becomes a pure advance', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ id: 1, status: 'paid' }));
        setup([]); // nothing open at all

        const entries = await service.allocate(
            mockCtx,
            makePaymentAttempt({ invoiceId: 1, amount: 5000 }),
        );

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ invoiceId: null, allocatedOrderId: null, amount: 5000 });
        expect(mockInvoiceService.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects allocating a payment against a target invoice in a different currency, rather than silently mixing them', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ id: 1, currencyCode: 'USD' }));
        setup([]);

        await expect(
            service.allocate(mockCtx, makePaymentAttempt({ invoiceId: 1, currencyCode: 'RUB' })),
        ).rejects.toThrow(/Currency mismatch/);
    });

    it('bounds the open-invoices scan and locks the rows (does not fetch/lock every open invoice a counterparty has ever accumulated)', async () => {
        const target = makeInvoice({ id: 1, amount: 5000 });
        mockInvoiceService.findOne.mockResolvedValue(target);
        setup([target]);

        await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000 }));

        expect(scanQb.take).toHaveBeenCalledWith(200);
        expect(scanQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    });

    it("filters the FIFO scan to the payment's own currency", async () => {
        const target = makeInvoice({ id: 1, amount: 5000, currencyCode: 'RUB' });
        mockInvoiceService.findOne.mockResolvedValue(target);
        setup([target]);

        await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000, currencyCode: 'RUB' }));

        expect(scanQb.andWhere).toHaveBeenCalledWith('invoice.currencyCode = :currencyCode', {
            currencyCode: 'RUB',
        });
    });

    it('still settles the target invoice first even when it falls outside the bounded FIFO scan (fetched separately, also locked)', async () => {
        // Simulate a counterparty/organization with 200 older open invoices already filling the
        // bounded scan — the target invoice (id 1) isn't among them, so it must be fetched
        // directly rather than silently skipped.
        const olderInvoices = Array.from({ length: 200 }, (_, i) =>
            makeInvoice({ id: 100 + i, amount: 10 }),
        );
        const target = makeInvoice({ id: 1, amount: 3000, status: 'issued' });
        mockInvoiceService.findOne.mockResolvedValue(target);
        setup(olderInvoices, target);

        const entries = await service.allocate(
            mockCtx,
            makePaymentAttempt({ invoiceId: 1, amount: 3000 }),
        );

        expect(preferredQb.setLock).toHaveBeenCalledWith('pessimistic_write');
        expect(entries[0]).toMatchObject({ invoiceId: 1, allocationAmount: 3000 });
        expect(mockInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 1, 'paid');
    });
});

describe('SettlementEntryService.getAdvanceBalance', () => {
    it('sums unallocated (invoiceId IS NULL) entries grouped by currency', async () => {
        const mockQb = {
            select: vi.fn().mockReturnThis(),
            addSelect: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockReturnThis(),
            getRawMany: vi.fn(async () => [{ currencyCode: 'RUB', amount: '1500' }]),
        };
        const mockConnection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => mockQb) })),
        } as unknown as TransactionalConnection;
        const service = new SettlementEntryService(mockConnection, {} as unknown as InvoiceService);

        const result = await service.getAdvanceBalance(mockCtx, 5);

        expect(result).toEqual([{ currencyCode: 'RUB', amount: 1500 }]);
    });
});
