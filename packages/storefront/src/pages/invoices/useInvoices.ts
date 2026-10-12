import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import {
    MyProformaInvoicesDocument,
    type MyProformaInvoicesQuery,
} from '../../api/generated/graphql';

export type InvoiceSummary = MyProformaInvoicesQuery['myProformaInvoices']['items'][number];

export interface MyInvoicesOptions {
    take: number;
    skip: number;
    status?: string;
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
    pending: 'Pending',
    issued: 'Issued',
    paid: 'Paid',
    cancelled: 'Cancelled',
};

export const INVOICE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> =
    {
        pending: 'warning',
        issued: 'warning',
        paid: 'success',
        cancelled: 'neutral',
    };

export function useInvoices(): {
    invoices: Ref<InvoiceSummary[]>;
    totalItems: Ref<number>;
    loading: Ref<boolean>;
    load: (options: MyInvoicesOptions) => Promise<void>;
} {
    const invoices = ref<InvoiceSummary[]>([]);
    const totalItems = ref(0);
    const loading = ref(false);

    async function load(options: MyInvoicesOptions): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(MyProformaInvoicesDocument, { options });
            invoices.value = result.myProformaInvoices.items;
            totalItems.value = result.myProformaInvoices.totalItems;
        } catch (e) {
            console.error('[useInvoices]', e);
        } finally {
            loading.value = false;
        }
    }

    return { invoices, totalItems, loading, load };
}
