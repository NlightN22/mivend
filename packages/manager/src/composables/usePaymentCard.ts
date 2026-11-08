import { ref, watch, type Ref } from 'vue';
import type { PaymentCardData } from '../api/payments';
import { fetchPaymentCard } from '../api/payments';

// A slower earlier response must not overwrite the card of the payment opened last.
export function usePaymentCard(id: Ref<string>): {
    payment: Ref<PaymentCardData | null>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    reload: () => Promise<void>;
} {
    const payment = ref<PaymentCardData | null>(null);
    const loading = ref(true);
    const failed = ref(false);
    let latest = 0;

    async function load(): Promise<void> {
        const request = ++latest;
        loading.value = true;
        failed.value = false;
        try {
            const result = await fetchPaymentCard(id.value);
            if (request === latest) payment.value = result;
        } catch {
            if (request === latest) {
                payment.value = null;
                failed.value = true;
            }
        } finally {
            if (request === latest) loading.value = false;
        }
    }

    watch(id, load, { immediate: true });
    return { payment, loading, failed, reload: load };
}
