import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import { PayProformaInvoiceDocument } from '../../api/generated/graphql';

export type PayInvoiceOutcome = 'success' | 'pending' | 'fail';

export function usePayInvoice(): {
    loading: Ref<boolean>;
    error: Ref<string | null>;
    payProformaInvoice: (
        invoiceId: string,
        outcome: PayInvoiceOutcome,
    ) => Promise<{ status: string } | null>;
} {
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function payProformaInvoice(
        proformaInvoiceId: string,
        outcome: PayInvoiceOutcome,
    ): Promise<{ status: string } | null> {
        loading.value = true;
        error.value = null;
        try {
            const result = await shopApi(PayProformaInvoiceDocument, {
                proformaInvoiceId,
                status: outcome,
            });
            return result.payProformaInvoice;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Payment failed';
            return null;
        } finally {
            loading.value = false;
        }
    }

    return { loading, error, payProformaInvoice };
}
