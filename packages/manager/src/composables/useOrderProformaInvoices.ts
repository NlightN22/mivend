import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { adminApi } from '../api/client';
import {
    OrderProformaInvoicesDocument,
    RequestProformaInvoicesForOrderDocument,
    type OrderProformaInvoicesQuery,
} from '../api/generated/graphql';
import { useAuthStore } from '../stores/auth';

export type OrderProformaInvoice = OrderProformaInvoicesQuery['proformaInvoicesForOrder'][number];

export interface UseOrderProformaInvoices {
    invoices: Ref<OrderProformaInvoice[]>;
    allowed: ComputedRef<boolean>;
    requesting: Ref<boolean>;
    error: Ref<string | null>;
    load: () => Promise<void>;
    request: () => Promise<void>;
}

export function useOrderProformaInvoices(orderId: () => string): UseOrderProformaInvoices {
    const authStore = useAuthStore();
    const invoices = ref<OrderProformaInvoice[]>([]);
    const requesting = ref(false);
    const error = ref<string | null>(null);
    const allowed = computed(() => authStore.hasPermission('UpdateOrder'));

    async function load(): Promise<void> {
        try {
            const result = await adminApi(OrderProformaInvoicesDocument, { orderId: orderId() });
            invoices.value = result.proformaInvoicesForOrder;
        } catch (e) {
            console.error('[useOrderProformaInvoices]', e);
            error.value = 'Failed to load proforma invoices.';
        }
    }

    async function request(): Promise<void> {
        requesting.value = true;
        error.value = null;
        try {
            await adminApi(RequestProformaInvoicesForOrderDocument, { orderId: orderId() });
            await load();
        } catch (e) {
            console.error('[useOrderProformaInvoices]', e);
            error.value = 'Failed to request proforma invoices. Try again later.';
        } finally {
            requesting.value = false;
        }
    }

    return { invoices, allowed, requesting, error, load, request };
}
