import { defineStore } from 'pinia';
import { ref } from 'vue';

export type PaymentMethod = 'online' | 'invoice' | 'deferred';
export type DeliveryType = 'courier' | 'pickup';
export type ResultState = 'success' | 'pending' | 'fail' | null;

export const useCheckoutStore = defineStore('checkout', () => {
    const selectedPayment = ref<PaymentMethod>('online');
    const selectedDelivery = ref<DeliveryType>('courier');
    const resultState = ref<ResultState>(null);

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
        selectedPayment.value = 'online';
        selectedDelivery.value = 'courier';
        resultState.value = null;
    }

    return {
        selectedPayment,
        selectedDelivery,
        resultState,
        setPayment,
        setDelivery,
        setResultState,
        reset,
    };
});
