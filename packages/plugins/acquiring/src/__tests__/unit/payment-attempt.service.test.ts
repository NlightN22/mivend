import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { ProformaInvoiceService } from '../../proforma-invoice.service';
import { PaymentAttemptService } from '../../payment-attempt.service';
import { SettlementEntryService } from '../../settlement-entry.service';

const mockCtx = {} as unknown as RequestContext;
const mockNumberingService = { next: vi.fn(async () => 'test-payment-number') };

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

describe('PaymentAttemptService.payProformaInvoice', () => {
    let service: PaymentAttemptService;
    let mockProformaInvoiceService: ReturnType<typeof createMockProformaInvoiceService>;
    let mockSettlementEntryService: ReturnType<typeof createMockSettlementEntryService>;
    let mockReconciliationIssueService: ReturnType<typeof createMockReconciliationIssueService>;
    let mockPaymentAttemptRepo: ReturnType<typeof createMockPaymentAttemptRepo>;
    let mockConnection: TransactionalConnection;

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
    function createMockProformaInvoiceService() {
        const findOne = vi.fn();
        // The locked re-read returns whatever the outside read returned last, unless a test overrides it.
        const findOneForUpdate = vi.fn(async () => {
            const results = findOne.mock.results;
            return results.length ? await results[results.length - 1].value : null;
        });
        return { findOne, findOneForUpdate, updateStatus: vi.fn() };
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
            // Default: no prior attempt for (channel, externalReference), so tests take the create path.
            // Idempotent-retry tests override this per test.
            findOne: vi.fn(async () => null),
        };
    }

    beforeEach(() => {
        mockPaymentAttemptRepo = createMockPaymentAttemptRepo();
        mockConnection = {
            getRepository: vi.fn(() => mockPaymentAttemptRepo),
            // Stubs Vendure's withTransaction: runs work with the same ctx, no real transaction or rollback.
            // Rollback semantics are only verifiable in the plugin's integration tests against Postgres.
            withTransaction: vi.fn(async (ctx: unknown, work: (ctx: unknown) => Promise<unknown>) =>
                work(ctx),
            ),
        } as unknown as TransactionalConnection;
        mockProformaInvoiceService = createMockProformaInvoiceService();
        mockSettlementEntryService = createMockSettlementEntryService();
        mockReconciliationIssueService = createMockReconciliationIssueService();
        service = new PaymentAttemptService(
            mockConnection,
            mockProformaInvoiceService as unknown as ProformaInvoiceService,
            mockSettlementEntryService as unknown as SettlementEntryService,
            mockReconciliationIssueService as never,
            mockNumberingService as never,
        );
    });

    it('records a captured PaymentAttempt and delegates allocation on a "success" outcome', async () => {
        const proformaInvoice = makeProformaInvoice({ status: 'issued' });
        mockProformaInvoiceService.findOne
            .mockResolvedValueOnce(proformaInvoice)
            .mockResolvedValueOnce({ ...proformaInvoice, status: 'paid' });

        const result = await service.payProformaInvoice(mockCtx, 1, 'success');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                proformaInvoiceId: 1,
                orderId: 10,
                amount: 5000,
                currencyCode: 'RUB',
                paymentStatus: 'captured',
                channel: 'online-acquiring',
            }),
        );
        expect(mockSettlementEntryService.allocate).toHaveBeenCalledWith(
            mockCtx,
            expect.objectContaining({ proformaInvoiceId: 1, paymentStatus: 'captured' }),
        );
        expect(result.status).toBe('paid');
    });

    it('moves a "pending" proforma invoice to "issued" on a "pending" outcome, without marking it paid', async () => {
        const proformaInvoice = makeProformaInvoice({ status: 'pending' });
        mockProformaInvoiceService.findOne
            .mockResolvedValueOnce(proformaInvoice)
            .mockResolvedValueOnce({ ...proformaInvoice, status: 'issued' });

        await service.payProformaInvoice(mockCtx, 1, 'pending');

        expect(mockProformaInvoiceService.updateStatus).toHaveBeenCalledWith(mockCtx, 1, 'issued');
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
    });

    it('rejects a direct payment when the locked re-read finds the proforma invoice cancelled', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'issued' }),
        );
        mockProformaInvoiceService.findOneForUpdate.mockResolvedValueOnce(
            makeProformaInvoice({ status: 'cancelled' }),
        );

        await expect(service.payProformaInvoice(mockCtx, 1, 'pending')).rejects.toThrow(
            /cancelled/,
        );
        expect(mockPaymentAttemptRepo.save).not.toHaveBeenCalled();
    });

    it('leaves locking to allocate on a capture, so document locks stay in FIFO order', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'issued' }),
        );

        await service.payProformaInvoice(mockCtx, 1, 'success');

        expect(mockProformaInvoiceService.findOneForUpdate).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).toHaveBeenCalledTimes(1);
    });

    it('does not regress a proforma invoice the locked re-read finds paid', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'pending' }),
        );
        mockProformaInvoiceService.findOneForUpdate.mockResolvedValueOnce(
            makeProformaInvoice({ status: 'paid' }),
        );

        await service.payProformaInvoice(mockCtx, 1, 'pending');

        expect(mockProformaInvoiceService.updateStatus).not.toHaveBeenCalled();
    });

    it('is a no-op when a PaymentAttempt already exists for the same (channel, externalReference) — level 3 idempotency, the external-integration-rules skill', async () => {
        const proformaInvoice = makeProformaInvoice({ status: 'issued' });
        mockProformaInvoiceService.findOne
            .mockResolvedValueOnce(proformaInvoice)
            .mockResolvedValueOnce(proformaInvoice);
        mockPaymentAttemptRepo.findOne.mockResolvedValueOnce({ id: 99 } as never);

        const result = await service.payProformaInvoice(
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

    it('leaves the proforma invoice status untouched on a "fail" outcome (retryable)', async () => {
        const proformaInvoice = makeProformaInvoice({ status: 'issued' });
        mockProformaInvoiceService.findOne.mockResolvedValue(proformaInvoice);

        const result = await service.payProformaInvoice(mockCtx, 1, 'fail');

        expect(mockProformaInvoiceService.updateStatus).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ paymentStatus: 'failed' }),
        );
        expect(result.status).toBe('issued');
    });

    it('does NOT reject a "success" outcome against an already-paid proforma invoice — delegates to allocate instead (cash application handles the overflow/duplicate, see docs/payments.md)', async () => {
        const proformaInvoice = makeProformaInvoice({ status: 'paid' });
        mockProformaInvoiceService.findOne
            .mockResolvedValueOnce(proformaInvoice)
            .mockResolvedValueOnce(proformaInvoice);

        await service.payProformaInvoice(mockCtx, 1, 'success');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ paymentStatus: 'captured' }),
        );
        expect(mockSettlementEntryService.allocate).toHaveBeenCalled();
    });

    it('rejects paying a cancelled proforma invoice', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'cancelled' }),
        );

        await expect(service.payProformaInvoice(mockCtx, 1, 'success')).rejects.toThrow(
            /cancelled/,
        );
        expect(mockPaymentAttemptRepo.create).not.toHaveBeenCalled();
    });

    it('lets a customer pay a superseded version: the payment is created and allocated', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'superseded', number: '1000007-01-1' }),
        );

        await service.payProformaInvoice(mockCtx, 1, 'success');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledTimes(1);
        expect(mockSettlementEntryService.allocate).toHaveBeenCalledTimes(1);
    });

    it('rejects paying a proforma invoice that does not exist', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(null);

        await expect(service.payProformaInvoice(mockCtx, 999, 'success')).rejects.toThrow(
            /not found/,
        );
    });

    it('defaults to the "online-acquiring" channel when none is given', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'issued' }),
        );

        await service.payProformaInvoice(mockCtx, 1, 'fail');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ channel: 'online-acquiring' }),
        );
    });

    it('records the given channel when one is passed (e.g. simulating an ERP-reported bank transfer)', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'issued' }),
        );

        await service.payProformaInvoice(mockCtx, 1, 'success', 'bank-transfer-erp');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ channel: 'bank-transfer-erp' }),
        );
    });

    it('stores the given externalReference as providerPaymentId (e.g. an RRN from a branch-kassa card terminal, or an ERP payment-document id)', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'issued' }),
        );

        await service.payProformaInvoice(mockCtx, 1, 'success', 'branch-kassa', '123456789012');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ providerPaymentId: '123456789012' }),
        );
    });

    it('generates a structured stub providerPaymentId when no externalReference is given — the external reference is mandatory for every channel', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'issued' }),
        );

        await service.payProformaInvoice(mockCtx, 1, 'success');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                providerPaymentId: expect.stringMatching(/^STUB-online-acquiring-1-\d+$/),
            }),
        );
    });

    it('runs the PaymentAttempt insert and allocation inside a single transaction', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'issued' }),
        );

        await service.payProformaInvoice(mockCtx, 1, 'success');

        expect(mockConnection.withTransaction).toHaveBeenCalledWith(mockCtx, expect.any(Function));
    });

    it('propagates a failure from inside the transaction (e.g. allocate throwing) rather than swallowing it — the caller sees the whole operation failed and can safely retry', async () => {
        mockProformaInvoiceService.findOne.mockResolvedValue(
            makeProformaInvoice({ status: 'issued' }),
        );
        mockSettlementEntryService.allocate.mockRejectedValueOnce(
            new Error('simulated crash mid-allocation'),
        );

        await expect(service.payProformaInvoice(mockCtx, 1, 'success')).rejects.toThrow(
            /simulated crash mid-allocation/,
        );
    });

    it('a "cancel" outcome records paymentStatus "canceled" and leaves the proforma invoice untouched', async () => {
        const proformaInvoice = makeProformaInvoice({ status: 'issued' });
        mockProformaInvoiceService.findOne.mockResolvedValue(proformaInvoice);

        const result = await service.payProformaInvoice(mockCtx, 1, 'cancel');

        expect(mockPaymentAttemptRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ paymentStatus: 'canceled' }),
        );
        expect(mockProformaInvoiceService.updateStatus).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
        expect(result.status).toBe('issued');
    });

    it("rejects an expectedOrganizationId that does not match the proforma invoice's real organization, reports a PaymentReconciliationIssue, and never applies the payment", async () => {
        const proformaInvoice = makeProformaInvoice({ organizationId: 1, status: 'issued' });
        mockProformaInvoiceService.findOne.mockResolvedValue(proformaInvoice);

        await expect(
            service.payProformaInvoice(mockCtx, 1, 'success', 'bank-transfer-erp', 'ERP-EVT-1', 2),
        ).rejects.toThrow(/organization 1.*organization 2/s);

        expect(mockReconciliationIssueService.report).toHaveBeenCalledWith(
            mockCtx,
            'ORGANIZATION_MISMATCH',
            expect.objectContaining({ proformaInvoiceId: 1, organizationId: 2 }),
        );
        expect(mockSettlementEntryService.allocate).not.toHaveBeenCalled();
        expect(mockPaymentAttemptRepo.save).not.toHaveBeenCalled();
    });

    it("applies the payment when expectedOrganizationId matches the proforma invoice's real organization", async () => {
        const proformaInvoice = makeProformaInvoice({ organizationId: 1, status: 'issued' });
        mockProformaInvoiceService.findOne
            .mockResolvedValueOnce(proformaInvoice)
            .mockResolvedValueOnce({ ...proformaInvoice, status: 'paid' });

        await service.payProformaInvoice(
            mockCtx,
            1,
            'success',
            'bank-transfer-erp',
            'ERP-EVT-1',
            1,
        );

        expect(mockReconciliationIssueService.report).not.toHaveBeenCalled();
        expect(mockSettlementEntryService.allocate).toHaveBeenCalledTimes(1);
    });

    it.each(['superseded', 'cancelled'] as const)(
        'an ERP-reported fact for a %s document is still allocated, not rejected',
        async status => {
            const proformaInvoice = makeProformaInvoice({ organizationId: 1, status });
            mockProformaInvoiceService.findOne.mockResolvedValue(proformaInvoice);

            await service.payProformaInvoice(
                mockCtx,
                1,
                'success',
                'bank-transfer-erp',
                'ERP-EVT-1',
                1,
            );

            expect(mockSettlementEntryService.allocate).toHaveBeenCalledTimes(1);
        },
    );

    it('skips organization validation entirely when expectedOrganizationId is not provided (a direct "pay now" call has no externally-claimed scope)', async () => {
        const proformaInvoice = makeProformaInvoice({ organizationId: 1, status: 'issued' });
        mockProformaInvoiceService.findOne
            .mockResolvedValueOnce(proformaInvoice)
            .mockResolvedValueOnce({ ...proformaInvoice, status: 'paid' });

        await service.payProformaInvoice(mockCtx, 1, 'success');

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

    it('findForCounterparty scopes payments by counterparty via a join through ProformaInvoice', async () => {
        const qb = createMockQb();
        qb.getManyAndCount.mockResolvedValue([[{ id: 1 }], 1]);
        const mockConnection = {
            getRepository: vi.fn(() => ({ createQueryBuilder: vi.fn(() => qb), find: vi.fn() })),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as ProformaInvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
            {} as never,
        );

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
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as ProformaInvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
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
            {} as unknown as ProformaInvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
            {} as never,
        );

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
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as ProformaInvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
            {} as never,
        );

        await service.findForCounterparty(mockCtx, '5', { search: 'RRN-123' });

        expect(qb.andWhere).toHaveBeenCalledWith('payment.number ILIKE :search', {
            search: '%RRN-123%',
        });
    });

    it('belongsToCounterparty is false when the payment has no proformaInvoiceId', async () => {
        const mockConnection = {
            getRepository: vi.fn(),
        } as unknown as TransactionalConnection;
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as ProformaInvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
            {} as never,
        );

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
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as ProformaInvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
            {} as never,
        );

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
        const service = new PaymentAttemptService(
            mockConnection,
            {} as unknown as ProformaInvoiceService,
            {} as unknown as SettlementEntryService,
            {} as never,
            {} as never,
        );

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
            const service = new PaymentAttemptService(
                mockConnection,
                {} as unknown as ProformaInvoiceService,
                {} as unknown as SettlementEntryService,
                {} as never,
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
                {} as unknown as ProformaInvoiceService,
                {} as unknown as SettlementEntryService,
                {} as never,
                {} as never,
            );

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
