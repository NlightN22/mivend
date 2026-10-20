import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDemoMode } from '../../composables/useDemoMode';
import { shopApi } from '../../api/client';
import { PaymentResultOrderDocument } from '../../api/generated/graphql';
import {
    describePaymentResult,
    isMissingOrderError,
    parseOrderCode,
    parsePaymentResultStatus,
    type PaymentResultStatus,
    type PaymentResultView,
} from '../../utils/paymentResultView';

export interface UsePaymentResult {
    status: ComputedRef<PaymentResultStatus>;
    loading: Ref<boolean>;
    view: Ref<PaymentResultView | null>;
    notFound: Ref<boolean>;
}

export function usePaymentResult(): UsePaymentResult {
    const route = useRoute();
    const router = useRouter();
    const { demoAllowed } = useDemoMode();
    const notFound = ref(false);
    const status = computed(() => parsePaymentResultStatus(route.query.status));
    const loading = ref(false);
    const view = ref<PaymentResultView | null>(null);

    async function load(): Promise<void> {
        if (!demoAllowed) return;
        const code = parseOrderCode(route.query.order);
        if (!code) {
            await router.replace('/orders');
            return;
        }
        loading.value = true;
        try {
            const { orderByCode } = await shopApi(PaymentResultOrderDocument, { code });
            view.value = orderByCode ? describePaymentResult(orderByCode) : null;
            notFound.value = !orderByCode;
        } catch (error) {
            view.value = null;
            notFound.value = isMissingOrderError(error);
        } finally {
            loading.value = false;
        }
    }

    onMounted(load);
    return { status, loading, view, notFound };
}
