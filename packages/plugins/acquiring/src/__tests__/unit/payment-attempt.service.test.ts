import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Invoice } from '../../entities/invoice.entity';
import { InvoiceService } from '../../invoice.service';
import { PaymentAttemptService } from '../../payment-attempt.service';
import { SettlementEntryService } from '../../settlement-entry.service';

const mockCtx = {} as unknown as RequestContext;

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
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

describe('PaymentAttemptService.payInvoice', () => {
    let service: PaymentAttemptService;
    let mockInvoiceService: ReturnType<typeof createMockInvoiceService>;
    let mockSettlementEntryService: ReturnType<typeof createMockSettlementEntryService>;
    let mockReconciliationIssueService: ReturnType<typeof createMockReconciliationIssueService>;
    let mockPaymentAttemptRepo: ReturnType<typeof createMockPaymentAttemptRepo>;
    let mockConnection: TransactionalConnection;

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
    function createMockInvoiceService() {
        return { findOne: vi.fn(), updateStatus: vi.fn() };
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function createMockSettlementEntryService() {
        return { allocate: vi.fn(async () => []) };
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function createMockReconciliationIssueService() {
        return { report: vi.fn(async () => ({ id: 1 })) };
    }
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    function createMockPaymentAttemptRepo() {
        return {
            create: vi.fn(input => input),
            save: vi.fn(async entity => entity),
            // payInvoice's level-3 idempotency check (AGENTS.md rule #13) — defaults to "no
            // existing attempt for this (channel, externalReference)" so these tests exercise the
            // normal create path; tests specifically for the idempotent-retry behavior override
            // this per-test.
            findOne: vi.fn(async () => null),
        };
    }

    beforeEach(() => {
        mockPaymentAttemptRepo = createMockPaymentAttemptRepo();
        mockConnection = {
            getRepository: vi.fn(() => mockPaymentAttemptRepo),
            // Mirrors Vendure's real withTransaction just enough for these unit tests: runs the
            // work with the same ctx (no real transaction/rollback semantics — that can only be
            // verified against a real Postgres, see the plugin's integration tests).
            withTransaction: vi.fn(async (ctx: unknown, work: (ctx: unknown) => Promise<unknown>) =>
                work(ctx),
            ),
        } as unknown as TransactionalConnection;
        mockInvoiceService = createMockInvoiceService();
        mockSettlementEntryService = createMockSettlementEntryService();
        mockReconciliationIssueService = createMockReconciliationIssueService();
        service = new PaymentAttemptService(
            mockConnection,
            mockInvoiceService as unknown as InvoiceService,
            mockSettlementEntryService as unknown as SettlementEntryService,
            mockReconciliationIssueService as never,
        );
    });

    it('records a captured PaymentAttempt and delegates allocation on a "success" outcome', async () => {
        const invoice = makeInvoice({ status: 'issued' });
        mockInvoiceService.findOne
            .mockResolvedValueOnce(invoice)
            .mockResolvedValueOnce({ ...invoice, status: 'paid' });

        const result = await service.payInvoice(mockCtx, 1, 'success');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                invoiceId: 1,
                orderId: 10,
                amount: 5000,
                currencyCode: 'RUB',
                paymentStatus: 'captured',
                channel: 'online-acquiring',
            }),
        );
        expect(mockSettlementEntryService.allocate).toHaveBeenCalledWith(
            mockCtx,
            expect.objectContaining({ invoiceId: 1, paymentStatus: 'captured' }),
        );
        expect(result.status).toBe('paid');
    });

    it('moves a "pending" invoice to "issued" on a "pending" outcome, without marking it paid', async () => {
        const invoice = makeInvoice({ status: 'pending' });
        mockInvoiceService.findOne
            .mockResolvedValueOnce(invoice)
            .mockResolvedValueOnce({ ...invoice, status: 'issued' });

        await service.payInvoice(mockCtx, 1, 'pending');

        expect(mockInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 1, 'issued');
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
    });

    it('is a no-op when a PaymentAttempt already exists for the same (channel, externalReference) — level 3 idempotency, AGENTS.md rule #13', async () => {
        const invoice = makeInvoice({ status: 'issued' });
        mockInvoiceService.findOne.mockResolvedValueOnce(invoice).mockResolvedValueOnce(invoice);
        mockPaymentAttemptRepo.findOne.mockResolvedValueOnce({ id: 99 } as never);

        const result = await service.payInvoice(
            mockCtx,
            1,
            'success',
            'branch-kassa',
            'RRN-already-applied',
        );

        expect(mockPaymentAttemptRepo.create).not.toHaveBeenCalled();
        expect(mockPaymentAttemptRepo.save).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
        expect(result.status).toBe('issued');
    });

    it('leaves the invoice status untouched on a "fail" outcome (retryable)', async () => {
        const invoice = makeInvoice({ status: 'issued' });
        mockInvoiceService.findOne.mockResolvedValue(invoice);

        const result = await service.payInvoice(mockCtx, 1, 'fail');

        expect(mockInvoiceService.updateStatus).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ paymentStatus: 'failed' }),
        );
        expect(result.status).toBe('issued');
    });

    it('does NOT reject a "success" outcome against an already-paid invoice — delegates to allocate instead (cash application handles the overflow/duplicate, see docs/payments.md)', async () => {
        const invoice = makeInvoice({ status: 'paid' });
        mockInvoiceService.findOne.mockResolvedValueOnce(invoice).mockResolvedValueOnce(invoice);

        await service.payInvoice(mockCtx, 1, 'success');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ paymentStatus: 'captured' }),
        );
        expect(mockSettlementEntryService.allocate).toHaveBeenCalled();
    });

    it('rejects paying a cancelled invoice', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ status: 'cancelled' }));

        await expect(service.payInvoice(mockCtx, 1, 'success')).rejects.toThrow(/cancelled/);
        expect(mockPaymentAttemptRepo.create).not.toHaveBeenCalled();
    });

    it('rejects paying an invoice that does not exist', async () => {
        mockInvoiceService.findOne.mockResolvedValue(null);

        await expect(service.payInvoice(mockCtx, 999, 'success')).rejects.toThrow(/not found/);
    });

    it('defaults to the "online-acquiring" channel when none is given', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ status: 'issued' }));

        await service.payInvoice(mockCtx, 1, 'fail');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ channel: 'online-acquiring' }),
        );
    });

    it('records the given channel when one is passed (e.g. simulating an ERP-reported bank transfer)', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ status: 'issued' }));

        await service.payInvoice(mockCtx, 1, 'success', 'bank-transfer-erp');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ channel: 'bank-transfer-erp' }),
        );
    });

    it('stores the given externalReference as providerPaymentId (e.g. an RRN from a branch-kassa card terminal, or an ERP payment-document id)', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ status: 'issued' }));

        await service.payInvoice(mockCtx, 1, 'success', 'branch-kassa', '123456789012');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ providerPaymentId: '123456789012' }),
        );
    });

    it('generates a structured stub providerPaymentId when no externalReference is given — the external reference is mandatory for every channel', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ status: 'issued' }));

        await service.payInvoice(mockCtx, 1, 'success');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                providerPaymentId: expect.stringMatching(/^STUB-online-acquiring-1-\d+$/),
            }),
        );
    });

    it('runs the PaymentAttempt insert and allocation inside a single transaction', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ status: 'issued' }));

        await service.payInvoice(mockCtx, 1, 'success');

        expect(mockConnection.withTransaction).toHaveBeenCalledWith(mockCtx, expect.any(Function));
    });

    it('propagates a failure from inside the transaction (e.g. allocate throwing) rather than swallowing it — the caller sees the whole operation failed and can safely retry', async () => {
        mockInvoiceService.findOne.mockResolvedValue(makeInvoice({ status: 'issued' }));
        mockSettlementEntryService.allocate.mockRejectedValueOnce(
            new Error('simulated crash mid-allocation'),
        );

        await expect(service.payInvoice(mockCtx, 1, 'success')).rejects.toThrow(
            /simulated crash mid-allocation/,
        );
    });

    it('a "cancel" outcome records paymentStatus "canceled" and leaves the invoice untouched', async () => {
        const invoice = makeInvoice({ status: 'issued' });
        mockInvoiceService.findOne.mockResolvedValue(invoice);

        const result = await service.payInvoice(mockCtx, 1, 'cancel');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ paymentStatus: 'canceled' }),
        );
        expect(mockInvoiceService.updateStatus).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
        expect(result.status).toBe('issued');
    });

    it("rejects an expectedOrganizationId that does not match the invoice's real organization, reports a PaymentReconciliationIssue, and never applies the payment", async () => {
        const invoice = makeInvoice({ organizationId: 1, status: 'issued' });
        mockInvoiceService.findOne.mockResolvedValue(invoice);

        await expect(
            service.payInvoice(mockCtx, 1, 'success', 'bank-transfer-erp', 'ERP-EVT-1', 2),
        ).rejects.toThrow(/organization 1.*organization 2/s);

        expect(mockReconciliationIssueService.report).toHaveBeenCalledWith(
            mockCtx,
            'ORGANIZATION_MISMATCH',
            expect.objectContaining({ invoiceId: 1, organizationId: 2 }),
        );
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
        expect(mockPaymentAttemptRepo.save).not.toHaveBeenCalled();
    });

    it("applies the payment when expectedOrganizationId matches the invoice's real organization", async () => {
        const invoice = makeInvoice({ organizationId: 1, status: 'issued' });
        mockInvoiceService.findOne
            .mockResolvedValueOnce(invoice)
            .mockResolvedValueOnce({ ...invoice, status: 'paid' });

        await service.payInvoice(mockCtx, 1, 'success', 'bank-transfer-erp', 'ERP-EVT-1', 1);

        expect(mockReconciliationIssueService.report).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).toHaveBeenCalledTimes(1);
    });

    it('skips organization validation entirely when expectedOrganizationId is not provided (a direct "pay now" call has no externally-claimed scope)', async () => {
        const invoice = makeInvoice({ organizationId: 1, status: 'issued' });
        mockInvoiceService.findOne
            .mockResolvedValueOnce(invoice)
            .mockResolvedValueOnce({ ...invoice, status: 'paid' });

        await service.payInvoice(mockCtx, 1, 'success');

        expect(mockReconciliationIssueService.report).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).toHaveBeenCalledTimes(1);
    });
});

describe('PaymentAttemptService queries', () => {
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

    it('findForCounterparty scopes payments by counterparty via a join through Invoice', async () => {
        const qb = createMockQb();
        qb.getManyAndCount.mockResolvedValue([[{ id: 1 }], 1]);
        const mockConnection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb), find: vi.fn() })),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as InvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
        );

        const result = await service.findForCounterparty(mockCtx, '5', { take: 10, skip: 0 });

        expect(qb.where).toHaveBeenCalledWith('invoice.counterpartyId = :counterpartyId', {
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
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as InvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
        );

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
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as InvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
        );

        await service.findForCounterparty(mockCtx, '5', { channel: 'bank-transfer-erp' });

        expect(qb.andWhere).toHaveBeenCalledWith('payment.channel = :channel', {
            channel: 'bank-transfer-erp',
        });
    });

    it('belongsToCounterparty is false when the payment has no invoiceId', async () => {
        const mockConnection = {
            getRepository: vi.fn(),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as InvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
        );

        const owned = await service.belongsToCounterparty(mockCtx, { invoiceId: null } as never, 5);

        expect(owned).toBe(false);
    });

    it("belongsToCounterparty matches the invoice's counterpartyId", async () => {
        const mockInvoiceRepo = { findOne: vi.fn(async () => makeInvoice({ counterpartyId: 5 })) };
        const mockConnection = {
            getRepository: vi.fn(() => mockInvoiceRepo),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as InvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
        );

        expect(await service.belongsToCounterparty(mockCtx, { invoiceId: 1 } as never, 5)).toBe(
            true,
        );
        expect(await service.belongsToCounterparty(mockCtx, { invoiceId: 1 } as never, 9)).toBe(
            false,
        );
    });

    it('getAllocationsForPayment joins each SettlementEntry to its invoice, with null for the advance row', async () => {
        const entries = [
            { id: 1, invoiceId: 2, sourcePaymentId: 99, amount: 3000 },
            { id: 2, invoiceId: null, sourcePaymentId: 99, amount: 1500 },
        ];
        const mockSettlementRepo = { find: vi.fn(async () => entries) };
        const mockInvoiceRepo = { findOne: vi.fn(async () => makeInvoice({ id: 2 })) };
        const mockConnection = {
            getRepository: vi.fn((_ctx, entity) =>
                entity === Invoice ? mockInvoiceRepo : mockSettlementRepo,
            ),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as InvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
        );

        const allocations = await service.getAllocationsForPayment(mockCtx, 99);

        expect(allocations).toHaveLength(2);
        expect(allocations[0].invoice).toEqual(makeInvoice({ id: 2 }));
        expect(allocations[1].invoice).toBeNull();
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
            const service = new PaymentAttemptService(
                mockConnection,
                {} as unknown as InvoiceService,
                {} as unknown as SettlementEntryService,
                {} as never,
            );

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
            const service = new PaymentAttemptService(
                mockConnection,
                {} as unknown as InvoiceService,
                {} as unknown as SettlementEntryService,
                {} as never,
            );

            const result = await service.sumCapturedAmountsByOrderIds(mockCtx, [10, 11, 12]);

            expect(qb.andWhere).toHaveBeenCalledWith('payment.paymentStatus = :status', {
                status: 'captured',
            });
            expect(result.get(10)).toBe(5000);
            expect(result.get(11)).toBe(1250);
            // Order 12 had no captured rows at all — absent from the map, not zero-with-a-key;
            // the resolver (AdminPaymentVisibilityResolver.orderPaymentSummaries) is the layer
            // that turns "absent" into a displayed 0.
            expect(result.has(12)).toBe(false);
        });
    });
});
