import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { shopApi } from '../../api/client';
import { PaymentResultOrderDocument } from '../../api/generated/graphql';
import {
    describePaymentResult,
    parseOrderCode,
    parsePaymentResultStatus,
    type PaymentResultStatus,
    type PaymentResultView,
} from '../../utils/paymentResultView';

export interface UsePaymentResult {
    status: ComputedRef<PaymentResultStatus>;
    loading: Ref<boolean>;
    view: Ref<PaymentResultView | null>;
}

export function usePaymentResult(): UsePaymentResult {
    const route = useRoute();
    const status = computed(() => parsePaymentResultStatus(route.query.status));
    const loading = ref(false);
    const view = ref<PaymentResultView | null>(null);

    async function load(): Promise<void> {
        const code = parseOrderCode(route.query.order);
        if (!code) return;
        loading.value = true;
        try {
            const { orderByCode } = await shopApi(PaymentResultOrderDocument, { code });
            view.value = orderByCode ? describePaymentResult(orderByCode) : null;
        } catch {
            view.value = null;
        } finally {
            loading.value = false;
        }
    }

    onMounted(load);
    return { status, loading, view };
}
