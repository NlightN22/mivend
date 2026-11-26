import { ref, type Ref } from 'vue';
import { shopApi } from '../../api/client';
import { PaymentStubAvailableDocument } from '../../api/generated/graphql';

const available = ref(false);
let loaded: Promise<void> | null = null;

export function usePaymentStubAvailable(): { available: Ref<boolean>; ready: Promise<void> } {
    loaded ??= shopApi(PaymentStubAvailableDocument)
        .then(result => {
            available.value = result.paymentStubAvailable;
        })
        .catch(() => {
            loaded = null;
        });
    return { available, ready: loaded };
}
