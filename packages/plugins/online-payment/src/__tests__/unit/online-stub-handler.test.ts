import { describe, expect, it, vi } from 'vitest';

import { onlineStubPaymentHandler } from '../../online-stub-handler';

function fakeInjector(overrides: {
    proformaInvoiceService?: unknown;
    globalSettingsService?: unknown;
    paymentAttemptService?: unknown;
}): {
    get: (token: unknown) => unknown;
} {
    const byName: Record<string, unknown> = {
        ProformaInvoiceService: overrides.proformaInvoiceService,
        GlobalSettingsService: overrides.globalSettingsService,
        PaymentAttemptService: overrides.paymentAttemptService,
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
            createProformaInvoicesForOrder: vi
                .fn()
                .mockResolvedValue([{ id: 20, organizationId: 1, amount: 1000 }]),
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
            createProformaInvoicesForOrder: vi
                .fn()
                .mockResolvedValue([{ id: 21, organizationId: 1, amount: 1000 }]),
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
            createProformaInvoicesForOrder: vi
                .fn()
                .mockResolvedValue([{ id: 22, organizationId: 1, amount: 1000 }]),
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
});
