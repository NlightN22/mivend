import {
    GlobalSettingsService,
    Injector,
    LanguageCode,
    Order,
    PaymentMethodHandler,
    PaymentMetadata,
    RequestContext,
} from '@vendure/core';
import { InvoiceService } from '@mivend/plugin-acquiring';

let invoiceService: InvoiceService;
let globalSettingsService: GlobalSettingsService;

interface SplitResult {
    metadata: PaymentMetadata;
    declineMessage?: string;
}

// Shared by both payment methods (see docs/payments.md — issue #46's split-payment acquirer,
// Robokassa, is not wired here yet). Always computes and materializes the real per-organization
// Invoice split (plugin-acquiring's InvoiceService, decided direction in docs/payments.md
// "Organizations") — offline terms need this too (issue #46 open question #5: the split applies
// to invoice/deferred payment the same as online, just without online payment's time pressure)
// — and surfaces it in Payment.metadata.invoices for visibility. Still creates exactly one
// Vendure Payment for the whole order (real per-organization payment routing is issue #46, out
// of scope here).
//
// Enforcement is gated by the admin-controlled GlobalSettings.organizationSplitEnabled toggle
// (Settings screen in Admin UI): when on, every product must already carry organizationId
// (erp-import rejects records without one, see ProductHandler) and a split that can't be
// computed is a real payment failure, not a silent single-payment fallback — there is no
// legitimate "no organization" case once the toggle is on.
async function computeInvoiceSplit(ctx: RequestContext, order: Order): Promise<SplitResult> {
    const settings = await globalSettingsService.getSettings(ctx);
    const splitEnabled = Boolean(settings.customFields?.organizationSplitEnabled);

    try {
        const invoices = await invoiceService.createInvoicesForOrder(ctx, order);
        return {
            metadata: {
                invoices: invoices.map(invoice => ({
                    organizationId: invoice.organizationId,
                    amount: invoice.amount,
                })),
            },
        };
    } catch (err) {
        if (splitEnabled) {
            return {
                metadata: {},
                declineMessage: `Organization split required but could not be computed: ${(err as Error).message}`,
            };
        }
        return { metadata: {} };
    }
}

// Invoice/deferred are offline payment terms — the customer doesn't pay through
// Vendure at checkout time, so the handler settles the payment step immediately
// on the "Authorized" state to move the order out of ArrangingPayment. Actual
// money collection happens outside Vendure (per contract), tracked via the
// existing ERP status sync (see plugin-erp-order), not via Vendure's payment flow.
export const offlineTermsPaymentHandler = new PaymentMethodHandler({
    code: 'offline-terms',
    description: [
        { languageCode: LanguageCode.en, value: 'Invoice / deferred payment (offline terms)' },
    ],
    args: {},
    init(injector: Injector) {
        invoiceService = injector.get(InvoiceService);
        globalSettingsService = injector.get(GlobalSettingsService);
    },
    createPayment: async (ctx, order) => {
        const { metadata, declineMessage } = await computeInvoiceSplit(ctx, order);
        if (declineMessage) {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                errorMessage: declineMessage,
                metadata: {},
            };
        }
        return {
            amount: order.totalWithTax,
            state: 'Authorized' as const,
            metadata,
        };
    },
    settlePayment: () => ({ success: true }),
});

// PaymentStubPage.vue's success/pending/fail buttons map directly to this handler's result via
// the `status` metadata arg.
export const onlineStubPaymentHandler = new PaymentMethodHandler({
    code: 'online-stub',
    description: [{ languageCode: LanguageCode.en, value: 'Online payment (demo stub)' }],
    args: {},
    init(injector: Injector) {
        invoiceService = injector.get(InvoiceService);
        globalSettingsService = injector.get(GlobalSettingsService);
    },
    createPayment: async (
        ctx,
        order,
        _amount,
        _args,
        metadata: PaymentMetadata & { status?: string },
    ) => {
        const { metadata: invoiceMetadata, declineMessage } = await computeInvoiceSplit(ctx, order);
        if (declineMessage) {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                errorMessage: declineMessage,
                metadata,
            };
        }

        if (metadata?.status === 'fail') {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                metadata: { ...metadata, ...invoiceMetadata },
            };
        }
        return {
            amount: order.totalWithTax,
            state: metadata?.status === 'pending' ? ('Authorized' as const) : ('Settled' as const),
            metadata: { ...metadata, ...invoiceMetadata },
        };
    },
    settlePayment: () => ({ success: true }),
});
