import { ref } from 'vue';
import { shopApi } from '../../api/client';
import {
    ProformaInvoiceDetailDocument,
    type ProformaInvoiceDetailQuery,
} from '../../api/generated/graphql';

export type ProformaInvoiceDetail = NonNullable<ProformaInvoiceDetailQuery['proformaInvoice']>;

export function useProformaInvoiceDetail(): {
    proformaInvoice: ReturnType<typeof ref<ProformaInvoiceDetail | null>>;
    loading: ReturnType<typeof ref<boolean>>;
    load: (id: string) => Promise<void>;
} {
    const proformaInvoice = ref<ProformaInvoiceDetail | null>(null);
    const loading = ref(false);

    async function load(id: string): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(ProformaInvoiceDetailDocument, { id });
            proformaInvoice.value = result.proformaInvoice ?? null;
        } catch (e) {
            console.error('[useProformaInvoiceDetail]', e);
        } finally {
            loading.value = false;
        }
    }

    return { proformaInvoice, loading, load };
}
