import { describe, expect, it, vi } from 'vitest';

import { onlineStubPaymentHandler } from '../../online-stub-handler';

const place = vi.fn(async (_ctx: unknown, order: { totalWithTax: number }) => ({
    amount: order.totalWithTax,
    amountChanged: false,
    decision: {},
    metadata: { public: { creditLimitExceeded: false }, placement: { route: 'erp-now' } },
}));

function fakeInjector(overrides: {
    proformaInvoiceService?: unknown;
    globalSettingsService?: unknown;
    paymentAttemptService?: unknown;
}): {
    get: (token: unknown) => unknown;
} {
    const byName: Record<string, unknown> = {
        ProformaInvoiceService: overrides.proformaInvoiceService,
        ProformaInvoiceIssuingService: overrides.proformaInvoiceService,
        GlobalSettingsService: overrides.globalSettingsService,
        PaymentAttemptService: overrides.paymentAttemptService,
        CreditPlacementService: { place },
    };
    return {
        get: (token: unknown) => byName[(token as { name: string }).name],
    };
}

const mockOrder = { id: 1, totalWithTax: 1000, currencyCode: 'RUB' } as never;
const mockCtx = {} as never;
const mockMethod = {} as never;

describe('onlineStubPaymentHandler', () => {
    it('settles successfully, includes the proforma invoice split, and records a captured PaymentAttempt per proforma invoice (online-acquiring channel)', async () => {
        const proformaInvoiceService = {
            issueForOrder: vi
                .fn()
                .mockResolvedValue({ current: [{ id: 20, organizationId: 1, amount: 1000 }] }),
        };
        const globalSettingsService = {
            getSettings: vi
                .fn()
                .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
        };
        const paymentAttemptService = { payProformaInvoice: vi.fn() };
        onlineStubPaymentHandler.init(
            fakeInjector({
                proformaInvoiceService,
                globalSettingsService,
                paymentAttemptService,
            }) as never,
        );

        const result = await onlineStubPaymentHandler.createPayment(
            mockCtx,
            mockOrder,
            1000,
            [],
            {},
            mockMethod,
        );

        expect(result.state).toBe('Settled');
        expect(paymentAttemptService.payProformaInvoice).toHaveBeenCalledWith(
            mockCtx,
            20,
            'success',
            'online-acquiring',
        );
    });

    it('records a "pending" PaymentAttempt per proforma invoice when metadata.status is "pending"', async () => {
        const proformaInvoiceService = {
            issueForOrder: vi
                .fn()
                .mockResolvedValue({ current: [{ id: 21, organizationId: 1, amount: 1000 }] }),
        };
        const globalSettingsService = {
            getSettings: vi
                .fn()
                .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
        };
        const paymentAttemptService = { payProformaInvoice: vi.fn() };
        onlineStubPaymentHandler.init(
            fakeInjector({
                proformaInvoiceService,
                globalSettingsService,
                paymentAttemptService,
            }) as never,
        );

        const result = await onlineStubPaymentHandler.createPayment(
            mockCtx,
            mockOrder,
            1000,
            [],
            { status: 'pending' },
            mockMethod,
        );

        expect(result.state).toBe('Authorized');
        expect(paymentAttemptService.payProformaInvoice).toHaveBeenCalledWith(
            mockCtx,
            21,
            'pending',
            'online-acquiring',
        );
    });

    it('declines when metadata.status is fail, regardless of split, and records a failed PaymentAttempt per proforma invoice', async () => {
        const proformaInvoiceService = {
            issueForOrder: vi
                .fn()
                .mockResolvedValue({ current: [{ id: 22, organizationId: 1, amount: 1000 }] }),
        };
        const globalSettingsService = {
            getSettings: vi
                .fn()
                .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
        };
        const paymentAttemptService = { payProformaInvoice: vi.fn() };
        onlineStubPaymentHandler.init(
            fakeInjector({
                proformaInvoiceService,
                globalSettingsService,
                paymentAttemptService,
            }) as never,
        );

        const result = await onlineStubPaymentHandler.createPayment(
            mockCtx,
            mockOrder,
            1000,
            [],
            { status: 'fail' },
            mockMethod,
        );

        expect(result.state).toBe('Declined');
        expect(paymentAttemptService.payProformaInvoice).toHaveBeenCalledWith(
            mockCtx,
            22,
            'fail',
            'online-acquiring',
        );
    });

    it('creates the payment for the amount the credit policy returns for a card', async () => {
        place.mockResolvedValueOnce({
            amount: 3500,
            amountChanged: false,
            decision: {},
            metadata: {
                public: { creditLimitExceeded: false },
                placement: { route: 'after-payment' },
            },
        });
        onlineStubPaymentHandler.init(
            fakeInjector({
                proformaInvoiceService: {
                    issueForOrder: vi.fn().mockResolvedValue({ current: [] }),
                },
                globalSettingsService: { getSettings: vi.fn().mockResolvedValue({}) },
                paymentAttemptService: { payProformaInvoice: vi.fn() },
            }) as never,
        );
        const result = await onlineStubPaymentHandler.createPayment(
            mockCtx,
            mockOrder,
            1000,
            [],
            {},
            mockMethod,
        );
        expect(place).toHaveBeenLastCalledWith(mockCtx, mockOrder, 'card', {});
        expect(result.amount).toBe(3500);
    });

    it('declines with the amount-changed code, before any proforma invoice is created', async () => {
        place.mockResolvedValueOnce({
            amount: 3500,
            amountChanged: true,
            decision: {},
            metadata: {
                public: { creditLimitExceeded: false },
                placement: { route: 'after-payment' },
            },
        });
        const proformaInvoiceService = { issueForOrder: vi.fn() };
        onlineStubPaymentHandler.init(
            fakeInjector({
                proformaInvoiceService,
                globalSettingsService: { getSettings: vi.fn().mockResolvedValue({}) },
                paymentAttemptService: { payProformaInvoice: vi.fn() },
            }) as never,
        );
        const result = await onlineStubPaymentHandler.createPayment(
            mockCtx,
            mockOrder,
            1000,
            [],
            { expectedAmountKopecks: 1000 },
            mockMethod,
        );
        expect(result.state).toBe('Declined');
        expect(result.errorMessage).toContain('CARD_AMOUNT_CHANGED');
        expect(proformaInvoiceService.issueForOrder).not.toHaveBeenCalled();
    });
});
