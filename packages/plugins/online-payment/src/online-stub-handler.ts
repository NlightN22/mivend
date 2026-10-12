import {
    GlobalSettingsService,
    Injector,
    LanguageCode,
    Order,
    PaymentMethodHandler,
    PaymentMetadata,
    RequestContext,
} from '@vendure/core';
import {
    ProformaInvoice,
    ProformaInvoiceService,
    PaymentAttemptService,
} from '@mivend/plugin-acquiring';

export const ONLINE_STUB_METHOD_CODE = 'online-stub';

let proformaInvoiceService: ProformaInvoiceService;
let globalSettingsService: GlobalSettingsService;
let paymentAttemptService: PaymentAttemptService;

interface SplitResult {
    metadata: PaymentMetadata;
    declineMessage?: string;
    proformaInvoices: ProformaInvoice[];
}

// Mirrors plugin-acquiring's offlineTermsPaymentHandler computeProformaInvoiceSplit (see
// docs/payments.md — issue #46's split-payment acquirer, Robokassa, is not wired here yet).
async function computeProformaInvoiceSplit(
    ctx: RequestContext,
    order: Order,
): Promise<SplitResult> {
    const settings = await globalSettingsService.getSettings(ctx);
    const splitEnabled = Boolean(settings.customFields?.organizationSplitEnabled);

    try {
        const proformaInvoices = await proformaInvoiceService.createProformaInvoicesForOrder(
            ctx,
            order,
        );
        return {
            metadata: {
                proformaInvoices: proformaInvoices.map(proformaInvoice => ({
                    organizationId: proformaInvoice.organizationId,
                    amount: proformaInvoice.amount,
                })),
            },
            proformaInvoices,
        };
    } catch (err) {
        if (splitEnabled) {
            return {
                metadata: {},
                declineMessage: `Organization split required but could not be computed: ${(err as Error).message}`,
                proformaInvoices: [],
            };
        }
        return { metadata: {}, proformaInvoices: [] };
    }
}

// PaymentStubPage.vue's success/pending/fail buttons map directly to this handler's result via
// the `status` metadata arg. This represents a real (demo-stub) attempt to move money right now —
// each proforma invoice in the split gets its own PaymentAttempt via PaymentAttemptService.payProformaInvoice (the
// same recording/allocation path the standalone "Pay proforma invoice" flow uses), so /payments reflects
// checkout-originated payments too, not only ones made later from the proforma invoice detail page.
export const onlineStubPaymentHandler = new PaymentMethodHandler({
    code: ONLINE_STUB_METHOD_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'Online payment (demo stub)' }],
    args: {},
    init(injector: Injector) {
        proformaInvoiceService = injector.get(ProformaInvoiceService);
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
            metadata: proformaInvoiceMetadata,
            declineMessage,
            proformaInvoices,
        } = await computeProformaInvoiceSplit(ctx, order);
        if (declineMessage) {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                errorMessage: declineMessage,
                metadata,
            };
        }

        if (metadata?.status === 'fail') {
            // Record the failed attempt against each proforma invoice for the /payments ledger — left as
            // 'pending' (not 'cancelled') by PaymentAttemptService: the customer can still retry
            // payment on the same order, so the proforma invoice's payment obligation still stands.
            for (const proformaInvoice of proformaInvoices) {
                await paymentAttemptService.payProformaInvoice(
                    ctx,
                    Number(proformaInvoice.id),
                    'fail',
                    'online-acquiring',
                );
            }
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                metadata: { ...metadata, ...proformaInvoiceMetadata },
            };
        }
        const settled = metadata?.status !== 'pending';
        for (const proformaInvoice of proformaInvoices) {
            await paymentAttemptService.payProformaInvoice(
                ctx,
                Number(proformaInvoice.id),
                settled ? 'success' : 'pending',
                'online-acquiring',
            );
        }
        return {
            amount: order.totalWithTax,
            state: settled ? ('Settled' as const) : ('Authorized' as const),
            metadata: { ...metadata, ...proformaInvoiceMetadata },
        };
    },
    settlePayment: () => ({ success: true }),
});
