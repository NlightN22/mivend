import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { PaymentAttempt } from '../../entities/payment-attempt.entity';
import { ProformaInvoiceService } from '../../proforma-invoice.service';
import { SettlementEntryService } from '../../settlement-entry.service';

const mockCtx = {} as unknown as RequestContext;

function makeProformaInvoice(overrides: Partial<ProformaInvoice>): ProformaInvoice {
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

function makePaymentAttempt(overrides: Partial<PaymentAttempt>): PaymentAttempt {
    return {
        id: 99,
        proformaInvoiceId: 1,
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
    let mockProformaInvoiceService: {
        findOne: ReturnType<typeof vi.fn>;
        updateStatus: ReturnType<typeof vi.fn>;
    };
    let mockProformaInvoiceRepo: ReturnType<typeof createMockProformaInvoiceRepo>;
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
    function createMockProformaInvoiceRepo(
        openProformaInvoices: ProformaInvoice[],
        findOneResult: ProformaInvoice | null = null,
    ) {
        scanQb = createChainableQb(openProformaInvoices);
        preferredQb = createChainableQb(findOneResult);
        let call = 0;
        return {
            createQueryBuilder: vi.fn(() => {
                call += 1;
                // First createQueryBuilder call is always the bounded FIFO scan; a second call
                // only happens for the "fetch the preferred proforma invoice directly" fallback path.
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

    function setup(
        openProformaInvoices: ProformaInvoice[],
        findOneResult: ProformaInvoice | null = null,
    ): void {
        mockProformaInvoiceRepo = createMockProformaInvoiceRepo(
            openProformaInvoices,
            findOneResult,
        );
        mockSettlementRepo = createMockSettlementRepo();
        mockConnection = {
            getRepository: vi.fn((_ctx, entity) => {
                return entity === ProformaInvoice ? mockProformaInvoiceRepo : mockSettlementRepo;
            }),
        } as unknown as TransactionalConnection;
        service = new SettlementEntryService(
            mockConnection,
            mockProformaInvoiceService as unknown as ProformaInvoiceService,
        );
    }

    beforeEach(() => {
        mockProformaInvoiceService = { findOne: vi.fn(), updateStatus: vi.fn() };
    });

    it('fully settles the target proforma invoice when the payment amount exactly covers it', async () => {
        const target = makeProformaInvoice({ id: 1, amount: 5000 });
        mockProformaInvoiceService.findOne.mockResolvedValue(target);
        setup([target]);

        const entries = await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000 }));

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ proformaInvoiceId: 1, allocationAmount: 5000 });
        expect(mockProformaInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 1, 'paid');
    });

    it("FIFOs any remainder to the counterparty/organization's other open proforma invoices, oldest first", async () => {
        const target = makeProformaInvoice({ id: 1, amount: 3000 });
        const older = makeProformaInvoice({ id: 2, amount: 2000 });
        mockProformaInvoiceService.findOne.mockResolvedValue(target);
        setup([target, older]);

        const entries = await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000 }));

        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ proformaInvoiceId: 1, allocationAmount: 3000 });
        expect(entries[1]).toMatchObject({ proformaInvoiceId: 2, allocationAmount: 2000 });
        expect(mockProformaInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 1, 'paid');
        expect(mockProformaInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 2, 'paid');
    });

    it('records the unallocatable remainder as an advance (proformaInvoiceId null) when every open proforma invoice is covered', async () => {
        const target = makeProformaInvoice({ id: 1, amount: 3000 });
        mockProformaInvoiceService.findOne.mockResolvedValue(target);
        setup([target]);

        const entries = await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000 }));

        expect(entries).toHaveLength(2);
        expect(entries[1]).toMatchObject({
            proformaInvoiceId: null,
            allocatedOrderId: null,
            amount: 2000,
        });
    });

    it('a second "success" payment against an already-paid target proforma invoice never touches it again, and flows entirely to the next open proforma invoice (double-payment / duplicate-channel scenario)', async () => {
        // target proforma invoice is already paid — the open-invoices query naturally excludes it (only
        // pending/issued are fetched), so the second capture never marks it "paid" a second time.
        const other = makeProformaInvoice({ id: 2, amount: 4000 });
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ id: 1, status: 'paid' }),
        );
        setup([other]); // the already-paid target proformaInvoice is not in the "open" set at all

        const entries = await service.allocate(
            mockCtx,
            makePaymentAttempt({ proformaInvoiceId: 1, amount: 5000 }),
        );

        expect(mockProformaInvoiceService.updateStatus).not.toHaveBeenCalledWith(
            mockCtx,
            1,
            'paid',
        );
        expect(entries[0]).toMatchObject({ proformaInvoiceId: 2, allocationAmount: 4000 });
        expect(entries[1]).toMatchObject({ proformaInvoiceId: null, amount: 1000 });
    });

    it('a duplicate payment with nothing else open becomes a pure advance', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ id: 1, status: 'paid' }),
        );
        setup([]); // nothing open at all

        const entries = await service.allocate(
            mockCtx,
            makePaymentAttempt({ proformaInvoiceId: 1, amount: 5000 }),
        );

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            proformaInvoiceId: null,
            allocatedOrderId: null,
            amount: 5000,
        });
        expect(mockProformaInvoiceService.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects allocating a payment against a target proforma invoice in a different currency, rather than silently mixing them', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ id: 1, currencyCode: 'USD' }),
        );
        setup([]);

        await expect(
            service.allocate(
                mockCtx,
                makePaymentAttempt({ proformaInvoiceId: 1, currencyCode: 'RUB' }),
            ),
        ).rejects.toThrow(/Currency mismatch/);
    });

    it('bounds the open-invoices scan and locks the rows (does not fetch/lock every open proforma invoice a counterparty has ever accumulated)', async () => {
        const target = makeProformaInvoice({ id: 1, amount: 5000 });
        mockProformaInvoiceService.findOne.mockResolvedValue(target);
        setup([target]);

        await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000 }));

        expect(scanQb.take).toHaveBeenCalledWith(200);
        expect(scanQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    });

    it("filters the FIFO scan to the payment's own currency", async () => {
        const target = makeProformaInvoice({ id: 1, amount: 5000, currencyCode: 'RUB' });
        mockProformaInvoiceService.findOne.mockResolvedValue(target);
        setup([target]);

        await service.allocate(mockCtx, makePaymentAttempt({ amount: 5000, currencyCode: 'RUB' }));

        expect(scanQb.andWhere).toHaveBeenCalledWith(
            'proformaInvoice.currencyCode = :currencyCode',
            {
                currencyCode: 'RUB',
            },
        );
    });

    it('still settles the target proforma invoice first even when it falls outside the bounded FIFO scan (fetched separately, also locked)', async () => {
        // Simulate a counterparty/organization with 200 older open proforma invoices already filling the
        // bounded scan — the target proforma invoice (id 1) isn't among them, so it must be fetched
        // directly rather than silently skipped.
        const olderProformaInvoices = Array.from({ length: 200 }, (_, i) =>
            makeProformaInvoice({ id: 100 + i, amount: 10 }),
        );
        const target = makeProformaInvoice({ id: 1, amount: 3000, status: 'issued' });
        mockProformaInvoiceService.findOne.mockResolvedValue(target);
        setup(olderProformaInvoices, target);

        const entries = await service.allocate(
            mockCtx,
            makePaymentAttempt({ proformaInvoiceId: 1, amount: 3000 }),
        );

        expect(preferredQb.setLock).toHaveBeenCalledWith('pessimistic_write');
        expect(entries[0]).toMatchObject({ proformaInvoiceId: 1, allocationAmount: 3000 });
        expect(mockProformaInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 1, 'paid');
    });
});

describe('SettlementEntryService.getAdvanceBalance', () => {
    it('sums unallocated (proformaInvoiceId IS NULL) entries grouped by currency', async () => {
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
        const service = new SettlementEntryService(
            mockConnection,
            {} as unknown as ProformaInvoiceService,
        );

        const result = await service.getAdvanceBalance(mockCtx, 5);

        expect(result).toEqual([{ currencyCode: 'RUB', amount: 1500 }]);
    });
});
