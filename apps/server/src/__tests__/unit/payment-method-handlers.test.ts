import { describe, expect, it, vi } from 'vitest';

import {
    offlineTermsPaymentHandler,
    onlineStubPaymentHandler,
} from '../../payment-method-handlers';

function fakeInjector(overrides: {
    invoiceService?: unknown;
    globalSettingsService?: unknown;
    paymentAttemptService?: unknown;
}): {
    get: (token: unknown) => unknown;
} {
    const byName: Record<string, unknown> = {
        InvoiceService: overrides.invoiceService,
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

describe('payment-method-handlers', () => {
    describe('offlineTermsPaymentHandler', () => {
        it('settles as Authorized, surfaces the invoice split in metadata, and does NOT record a PaymentAttempt (no real money has moved yet)', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi.fn().mockResolvedValue([
                    { id: 10, organizationId: 1, amount: 600 },
                    { id: 11, organizationId: 2, amount: 400 },
                ]),
                updateStatusForOrder: vi.fn(),
            };
            const globalSettingsService = {
                getSettings: vi
                    .fn()
                    .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
            };
            const paymentAttemptService = { payInvoice: vi.fn() };
            offlineTermsPaymentHandler.init(
                fakeInjector({
                    invoiceService,
                    globalSettingsService,
                    paymentAttemptService,
                }) as never,
            );

            const result = await offlineTermsPaymentHandler.createPayment(
                mockCtx,
                mockOrder,
                1000,
                [],
                {},
                mockMethod,
            );

            expect(result.state).toBe('Authorized');
            expect((result as { metadata: { invoices?: unknown[] } }).metadata.invoices).toEqual([
                { organizationId: 1, amount: 600 },
                { organizationId: 2, amount: 400 },
            ]);
            expect(invoiceService.updateStatusForOrder).toHaveBeenCalledWith(mockCtx, 1, 'issued');
            expect(paymentAttemptService.payInvoice).not.toHaveBeenCalled();
        });

        it('declines when the split is required but cannot be computed', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi.fn().mockRejectedValue(new Error('no organizationId')),
            };
            const globalSettingsService = {
                getSettings: vi
                    .fn()
                    .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
            };
            offlineTermsPaymentHandler.init(
                fakeInjector({ invoiceService, globalSettingsService }) as never,
            );

            const result = await offlineTermsPaymentHandler.createPayment(
                mockCtx,
                mockOrder,
                1000,
                [],
                {},
                mockMethod,
            );

            expect(result.state).toBe('Declined');
        });

        it('does not block payment when the split cannot be computed but enforcement is off', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi.fn().mockRejectedValue(new Error('no organizationId')),
                updateStatusForOrder: vi.fn(),
            };
            const globalSettingsService = {
                getSettings: vi
                    .fn()
                    .mockResolvedValue({ customFields: { organizationSplitEnabled: false } }),
            };
            offlineTermsPaymentHandler.init(
                fakeInjector({ invoiceService, globalSettingsService }) as never,
            );

            const result = await offlineTermsPaymentHandler.createPayment(
                mockCtx,
                mockOrder,
                1000,
                [],
                {},
                mockMethod,
            );

            expect(result.state).toBe('Authorized');
        });
    });

    describe('onlineStubPaymentHandler', () => {
        it('settles successfully, includes the invoice split, and records a captured PaymentAttempt per invoice (online-acquiring channel)', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi
                    .fn()
                    .mockResolvedValue([{ id: 20, organizationId: 1, amount: 1000 }]),
            };
            const globalSettingsService = {
                getSettings: vi
                    .fn()
                    .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
            };
            const paymentAttemptService = { payInvoice: vi.fn() };
            onlineStubPaymentHandler.init(
                fakeInjector({
                    invoiceService,
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
            expect(paymentAttemptService.payInvoice).toHaveBeenCalledWith(
                mockCtx,
                20,
                'success',
                'online-acquiring',
            );
        });

        it('records a "pending" PaymentAttempt per invoice when metadata.status is "pending"', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi
                    .fn()
                    .mockResolvedValue([{ id: 21, organizationId: 1, amount: 1000 }]),
            };
            const globalSettingsService = {
                getSettings: vi
                    .fn()
                    .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
            };
            const paymentAttemptService = { payInvoice: vi.fn() };
            onlineStubPaymentHandler.init(
                fakeInjector({
                    invoiceService,
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
            expect(paymentAttemptService.payInvoice).toHaveBeenCalledWith(
                mockCtx,
                21,
                'pending',
                'online-acquiring',
            );
        });

        it('declines when metadata.status is fail, regardless of split, and records a failed PaymentAttempt per invoice', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi
                    .fn()
                    .mockResolvedValue([{ id: 22, organizationId: 1, amount: 1000 }]),
            };
            const globalSettingsService = {
                getSettings: vi
                    .fn()
                    .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
            };
            const paymentAttemptService = { payInvoice: vi.fn() };
            onlineStubPaymentHandler.init(
                fakeInjector({
                    invoiceService,
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
            expect(paymentAttemptService.payInvoice).toHaveBeenCalledWith(
                mockCtx,
                22,
                'fail',
                'online-acquiring',
            );
        });
    });
});
