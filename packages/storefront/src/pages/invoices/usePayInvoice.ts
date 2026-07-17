import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import { PayInvoiceDocument } from '../../api/generated/graphql';

export type PayInvoiceOutcome = 'success' | 'pending' | 'fail';

export function usePayInvoice(): {
    loading: Ref<boolean>;
    error: Ref<string | null>;
    payInvoice: (
        invoiceId: string,
        outcome: PayInvoiceOutcome,
    ) => Promise<{ status: string } | null>;
} {
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function payInvoice(
        invoiceId: string,
        outcome: PayInvoiceOutcome,
    ): Promise<{ status: string } | null> {
        loading.value = true;
        error.value = null;
        try {
            const result = await shopApi(PayInvoiceDocument, { invoiceId, status: outcome });
            return result.payInvoice;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Payment failed';
            return null;
        } finally {
            loading.value = false;
        }
    }

    return { loading, error, payInvoice };
}
