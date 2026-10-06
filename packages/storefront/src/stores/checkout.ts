import { defineStore } from 'pinia';
import { ref } from 'vue';
import { shopApi } from '../api/client';
import { EligiblePaymentMethodsForCheckoutDocument } from '../api/generated/graphql';

export type PaymentMethod = 'online' | 'invoice' | 'deferred';
export type DeliveryType = 'courier' | 'pickup';
export type ResultState = 'success' | 'pending' | 'fail' | null;

const METHOD_BY_CODE: Record<string, PaymentMethod> = {
    'online-stub': 'online',
    'offline-terms': 'invoice',
    'deferred-payment': 'deferred',
};

export const useCheckoutStore = defineStore('checkout', () => {
    const availableMethods = ref<PaymentMethod[]>([]);
    const methodsLoaded = ref(false);
    const selectedPayment = ref<PaymentMethod | null>(null);
    const selectedDelivery = ref<DeliveryType>('courier');
    const resultState = ref<ResultState>(null);

    async function loadPaymentMethods(): Promise<void> {
        const { eligiblePaymentMethods } = await shopApi(EligiblePaymentMethodsForCheckoutDocument);
        availableMethods.value = eligiblePaymentMethods
            .filter(m => m.isEligible && m.code in METHOD_BY_CODE)
            .map(m => METHOD_BY_CODE[m.code]);
        if (!selectedPayment.value || !availableMethods.value.includes(selectedPayment.value)) {
            selectedPayment.value = availableMethods.value[0] ?? null;
        }
        methodsLoaded.value = true;
    }

    function setPayment(method: PaymentMethod): void {
        selectedPayment.value = method;
    }

    function setDelivery(type: DeliveryType): void {
        selectedDelivery.value = type;
    }

    function setResultState(state: ResultState): void {
        resultState.value = state;
    }

    function reset(): void {
        availableMethods.value = [];
        methodsLoaded.value = false;
        selectedPayment.value = null;
        selectedDelivery.value = 'courier';
        resultState.value = null;
    }

    return {
        availableMethods,
        methodsLoaded,
        selectedPayment,
        selectedDelivery,
        resultState,
        loadPaymentMethods,
        setPayment,
        setDelivery,
        setResultState,
        reset,
    };
});
