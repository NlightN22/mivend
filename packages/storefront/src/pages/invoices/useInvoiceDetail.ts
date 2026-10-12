import { ref } from 'vue';
import { shopApi } from '../../api/client';
import {
    ProformaInvoiceDetailDocument,
    type ProformaInvoiceDetailQuery,
} from '../../api/generated/graphql';

export type InvoiceDetail = NonNullable<ProformaInvoiceDetailQuery['proformaInvoice']>;

export function useInvoiceDetail(): {
    invoice: ReturnType<typeof ref<InvoiceDetail | null>>;
    loading: ReturnType<typeof ref<boolean>>;
    load: (id: string) => Promise<void>;
} {
    const invoice = ref<InvoiceDetail | null>(null);
    const loading = ref(false);

    async function load(id: string): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(ProformaInvoiceDetailDocument, { id });
            invoice.value = result.proformaInvoice ?? null;
        } catch (e) {
            console.error('[useInvoiceDetail]', e);
        } finally {
            loading.value = false;
        }
    }

    return { invoice, loading, load };
}
