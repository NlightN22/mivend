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
            query: vi.fn(async () => []),
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
        const lockKeys = mockPaymentAttemptRepo.query.mock.calls.map(
            (c: unknown[]) => (c[1] as string[])[0],
        );
        expect(lockKeys).toEqual([`proformaInvoices-for-order:${makeProformaInvoice({}).orderId}`]);
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
