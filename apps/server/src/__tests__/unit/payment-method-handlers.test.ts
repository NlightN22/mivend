import { describe, expect, it, vi } from 'vitest';

import {
    offlineTermsPaymentHandler,
    onlineStubPaymentHandler,
} from '../../payment-method-handlers';

function fakeInjector(overrides: { invoiceService?: unknown; globalSettingsService?: unknown }): {
    get: (token: unknown) => unknown;
} {
    const byName: Record<string, unknown> = {
        InvoiceService: overrides.invoiceService,
        GlobalSettingsService: overrides.globalSettingsService,
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
        it('settles as Authorized and surfaces the invoice split in metadata', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi.fn().mockResolvedValue([
                    { organizationId: 1, amount: 600 },
                    { organizationId: 2, amount: 400 },
                ]),
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

            expect(result.state).toBe('Authorized');
            expect((result as { metadata: { invoices?: unknown[] } }).metadata.invoices).toEqual([
                { organizationId: 1, amount: 600 },
                { organizationId: 2, amount: 400 },
            ]);
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
        it('settles successfully and includes the invoice split', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi
                    .fn()
                    .mockResolvedValue([{ organizationId: 1, amount: 1000 }]),
            };
            const globalSettingsService = {
                getSettings: vi
                    .fn()
                    .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
            };
            onlineStubPaymentHandler.init(
                fakeInjector({ invoiceService, globalSettingsService }) as never,
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
        });

        it('declines when metadata.status is fail, regardless of split', async () => {
            const invoiceService = {
                createInvoicesForOrder: vi
                    .fn()
                    .mockResolvedValue([{ organizationId: 1, amount: 1000 }]),
            };
            const globalSettingsService = {
                getSettings: vi
                    .fn()
                    .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
            };
            onlineStubPaymentHandler.init(
                fakeInjector({ invoiceService, globalSettingsService }) as never,
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
        });
    });
});
