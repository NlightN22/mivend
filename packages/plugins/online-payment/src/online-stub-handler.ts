import {
    GlobalSettingsService,
    Injector,
    LanguageCode,
    Order,
    PaymentMethodHandler,
    PaymentMetadata,
    RequestContext,
} from '@vendure/core';
import { Invoice, InvoiceService, PaymentAttemptService } from '@mivend/plugin-acquiring';

export const ONLINE_STUB_METHOD_CODE = 'online-stub';

let invoiceService: InvoiceService;
let globalSettingsService: GlobalSettingsService;
let paymentAttemptService: PaymentAttemptService;

interface SplitResult {
    metadata: PaymentMetadata;
    declineMessage?: string;
    invoices: Invoice[];
}

// Mirrors plugin-acquiring's offlineTermsPaymentHandler computeInvoiceSplit (see
// docs/payments.md — issue #46's split-payment acquirer, Robokassa, is not wired here yet).
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
            invoices,
        };
    } catch (err) {
        if (splitEnabled) {
            return {
                metadata: {},
                declineMessage: `Organization split required but could not be computed: ${(err as Error).message}`,
                invoices: [],
            };
        }
        return { metadata: {}, invoices: [] };
    }
}

// PaymentStubPage.vue's success/pending/fail buttons map directly to this handler's result via
// the `status` metadata arg. This represents a real (demo-stub) attempt to move money right now —
// each invoice in the split gets its own PaymentAttempt via PaymentAttemptService.payInvoice (the
// same recording/allocation path the standalone "Pay invoice" flow uses), so /payments reflects
// checkout-originated payments too, not only ones made later from the invoice detail page.
export const onlineStubPaymentHandler = new PaymentMethodHandler({
    code: ONLINE_STUB_METHOD_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'Online payment (demo stub)' }],
    args: {},
    init(injector: Injector) {
        invoiceService = injector.get(InvoiceService);
        globalSettingsService = injector.get(GlobalSettingsService);
        paymentAttemptService = injector.get(PaymentAttemptService);
    },
    createPayment: async (
        ctx,
        order,
        _amount,
        _args,
        metadata: PaymentMetadata & { status?: string },
    ) => {
        const {
            metadata: invoiceMetadata,
            declineMessage,
            invoices,
        } = await computeInvoiceSplit(ctx, order);
        if (declineMessage) {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                errorMessage: declineMessage,
                metadata,
            };
        }

        if (metadata?.status === 'fail') {
            // Record the failed attempt against each invoice for the /payments ledger — left as
            // 'pending' (not 'cancelled') by PaymentAttemptService: the customer can still retry
            // payment on the same order, so the invoice's payment obligation still stands.
            for (const invoice of invoices) {
                await paymentAttemptService.payInvoice(
                    ctx,
                    Number(invoice.id),
                    'fail',
                    'online-acquiring',
                );
            }
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                metadata: { ...metadata, ...invoiceMetadata },
            };
        }
        const settled = metadata?.status !== 'pending';
        for (const invoice of invoices) {
            await paymentAttemptService.payInvoice(
                ctx,
                Number(invoice.id),
                settled ? 'success' : 'pending',
                'online-acquiring',
            );
        }
        return {
            amount: order.totalWithTax,
            state: settled ? ('Settled' as const) : ('Authorized' as const),
            metadata: { ...metadata, ...invoiceMetadata },
        };
    },
    settlePayment: () => ({ success: true }),
});
