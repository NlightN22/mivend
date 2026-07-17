import { ref } from 'vue';
import { shopApi } from '../../api/client';
import { PaymentDetailDocument, type PaymentDetailQuery } from '../../api/generated/graphql';

export type PaymentDetail = NonNullable<PaymentDetailQuery['payment']>;

export function usePaymentDetail(): {
    payment: ReturnType<typeof ref<PaymentDetail | null>>;
    loading: ReturnType<typeof ref<boolean>>;
    load: (id: string) => Promise<void>;
} {
    const payment = ref<PaymentDetail | null>(null);
    const loading = ref(false);

    async function load(id: string): Promise<void> {
        loading.value = true;
        try {
            const result = await shopApi(PaymentDetailDocument, { id });
            payment.value = result.payment ?? null;
        } catch (e) {
            console.error('[usePaymentDetail]', e);
        } finally {
            loading.value = false;
        }
    }

    return { payment, loading, load };
}
