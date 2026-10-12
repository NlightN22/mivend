import { describe, expect, it, vi } from 'vitest';

import { offlineTermsPaymentHandler } from '../../offline-terms-handler';

function fakeInjector(overrides: {
    proformaInvoiceService?: unknown;
    globalSettingsService?: unknown;
}): {
    get: (token: unknown) => unknown;
} {
    const byName: Record<string, unknown> = {
        ProformaInvoiceService: overrides.proformaInvoiceService,
        GlobalSettingsService: overrides.globalSettingsService,
    };
    return {
        get: (token: unknown) => byName[(token as { name: string }).name],
    };
}

const mockOrder = { id: 1, totalWithTax: 1000, currencyCode: 'RUB' } as never;
const mockCtx = {} as never;
const mockMethod = {} as never;

describe('offlineTermsPaymentHandler', () => {
    it('settles as Authorized, surfaces the proforma invoice split in metadata, and does NOT record a PaymentAttempt (no real money has moved yet)', async () => {
        const proformaInvoiceService = {
            createProformaInvoicesForOrder: vi.fn().mockResolvedValue([
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
        offlineTermsPaymentHandler.init(
            fakeInjector({ proformaInvoiceService, globalSettingsService }) as never,
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
        expect(
            (result as { metadata: { proformaInvoices?: unknown[] } }).metadata.proformaInvoices,
        ).toEqual([
            { organizationId: 1, amount: 600 },
            { organizationId: 2, amount: 400 },
        ]);
        expect(proformaInvoiceService.updateStatusForOrder).toHaveBeenCalledWith(
            mockCtx,
            1,
            'issued',
        );
    });

    it('declines when the split is required but cannot be computed', async () => {
        const proformaInvoiceService = {
            createProformaInvoicesForOrder: vi
                .fn()
                .mockRejectedValue(new Error('no organizationId')),
        };
        const globalSettingsService = {
            getSettings: vi
                .fn()
                .mockResolvedValue({ customFields: { organizationSplitEnabled: true } }),
        };
        offlineTermsPaymentHandler.init(
            fakeInjector({ proformaInvoiceService, globalSettingsService }) as never,
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
        const proformaInvoiceService = {
            createProformaInvoicesForOrder: vi
                .fn()
                .mockRejectedValue(new Error('no organizationId')),
            updateStatusForOrder: vi.fn(),
        };
        const globalSettingsService = {
            getSettings: vi
                .fn()
                .mockResolvedValue({ customFields: { organizationSplitEnabled: false } }),
        };
        offlineTermsPaymentHandler.init(
            fakeInjector({ proformaInvoiceService, globalSettingsService }) as never,
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
