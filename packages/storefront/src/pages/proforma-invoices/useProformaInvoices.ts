import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import {
    MyProformaInvoicesDocument,
    type MyProformaInvoicesQuery,
} from '../../api/generated/graphql';

export type ProformaInvoiceSummary = MyProformaInvoicesQuery['myProformaInvoices']['items'][number];

export interface MyProformaInvoicesOptions {
    take: number;
    skip: number;
    status?: string;
}

export const PROFORMA_INVOICE_STATUS_LABEL: Record<string, string> = {
    pending: 'Pending',
    issued: 'Issued',
    paid: 'Paid',
    cancelled: 'Cancelled',
    superseded: 'Superseded',
};

export const PROFORMA_INVOICE_STATUS_VARIANT: Record<
    string,
    'success' | 'warning' | 'neutral' | 'danger'
> = {
    pending: 'warning',
    issued: 'warning',
    paid: 'success',
    cancelled: 'neutral',
    superseded: 'neutral',
};

export function useProformaInvoices(): {
    proformaInvoices: Ref<ProformaInvoiceSummary[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    load: (options: MyProformaInvoicesOptions) => Promise<void>;
} {
    const proformaInvoices = ref<ProformaInvoiceSummary[]>([]);
    const totalItems = ref(0);
    const loading = ref(false);

    async function load(options: MyProformaInvoicesOptions): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(MyProformaInvoicesDocument, { options });
            proformaInvoices.value = result.myProformaInvoices.items;
            totalItems.value = result.myProformaInvoices.totalItems;
        } catch (e) {
            console.error('[useProformaInvoices]', e);
        } finally {
            loading.value = false;
        }
    }

    return { proformaInvoices, totalItems, loading, load };
}
