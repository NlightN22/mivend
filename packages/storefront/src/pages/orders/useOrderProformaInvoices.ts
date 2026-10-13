import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import {
    OrderProformaInvoicesDocument,
    RequestProformaInvoicesDocument,
    type OrderProformaInvoicesQuery,
} from '../../api/generated/graphql';

export type OrderProformaInvoice =
    OrderProformaInvoicesQuery['myProformaInvoices']['items'][number];

export function useOrderProformaInvoices(orderCode: () => string): {
    proformaInvoices: Ref<OrderProformaInvoice[]>;
    requesting: Ref<boolean>;
    failed: Ref<boolean>;
    load: () => Promise<void>;
    request: () => Promise<void>;
} {
    const proformaInvoices = ref<OrderProformaInvoice[]>([]);
    const requesting = ref(false);
    const failed = ref(false);

    async function load(): Promise<void> {
        try {
            const result = await shopApi(OrderProformaInvoicesDocument, {
                orderCode: orderCode(),
            });
            proformaInvoices.value = result.myProformaInvoices.items;
        } catch (e) {
            console.error('[useOrderProformaInvoices]', e);
        }
    }

    async function request(): Promise<void> {
        requesting.value = true;
        failed.value = false;
        try {
            await shopApi(RequestProformaInvoicesDocument, { orderCode: orderCode() });
            await load();
        } catch (e) {
            console.error('[useOrderProformaInvoices]', e);
            failed.value = true;
        } finally {
            requesting.value = false;
        }
    }

    return { proformaInvoices, requesting, failed, load, request };
}
