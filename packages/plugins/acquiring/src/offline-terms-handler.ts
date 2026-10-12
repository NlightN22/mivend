import {
    GlobalSettingsService,
    Injector,
    LanguageCode,
    Order,
    PaymentMethodHandler,
    PaymentMetadata,
    RequestContext,
} from '@vendure/core';
import { CreditPlacementService } from '@mivend/plugin-deferred-payment';
import { ProformaInvoice } from './entities/proforma-invoice.entity';
import { ProformaInvoiceService } from './proforma-invoice.service';

export const OFFLINE_TERMS_METHOD_CODE = 'offline-terms';

let proformaInvoiceService: ProformaInvoiceService;
let globalSettingsService: GlobalSettingsService;
let creditPlacementService: CreditPlacementService;

interface SplitResult {
    metadata: PaymentMetadata;
    declineMessage?: string;
    proformaInvoices: ProformaInvoice[];
}

// Splits the order into per-organization proforma invoices; a split that cannot be computed declines the payment
// only when GlobalSettings.organizationSplitEnabled is on (docs/payments.md "Organizations").
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

// Bank transfer: Authorized only lets Vendure place the order; Settled is the payment fact (docs/payments.md).
export const offlineTermsPaymentHandler = new PaymentMethodHandler({
    code: OFFLINE_TERMS_METHOD_CODE,
    description: [
        {
            languageCode: LanguageCode.en,
            value: 'Bank transfer (proforma invoice)',
        },
    ],
    args: {},
    init(injector: Injector) {
        proformaInvoiceService = injector.get(ProformaInvoiceService);
        globalSettingsService = injector.get(GlobalSettingsService);
        creditPlacementService = injector.get(CreditPlacementService);
    },
    createPayment: async (ctx, order, _amount, _args, inputMetadata) => {
        const placement = await creditPlacementService.place(
            ctx,
            order,
            'bank-transfer',
            inputMetadata,
        );
        const { metadata, declineMessage } = await computeProformaInvoiceSplit(ctx, order);
        if (declineMessage) {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                errorMessage: declineMessage,
                metadata: {},
            };
        }
        await proformaInvoiceService.updateStatusForOrder(ctx, Number(order.id), 'issued');
        return {
            amount: placement.amount,
            state: 'Authorized' as const,
            metadata: { ...placement.metadata, ...metadata },
        };
    },
    settlePayment: () => ({ success: true }),
});
