import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { shopApi } from '../api/client';
import {
    EligiblePaymentMethodsForCheckoutDocument,
    EligibleShippingMethodsForCheckoutDocument,
} from '../api/generated/graphql';
import { SHIPPING_CODE_BY_DELIVERY, type DeliveryType } from '../utils/deliveryMethods';
import { useAuthStore } from './auth';

export interface CreditPreview {
    exceeded: boolean;
    availableCredit: number;
    orderAmount: number;
}

export type PaymentMethod = 'online' | 'invoice' | 'deferred';
export type { DeliveryType };

const DELIVERY_ORDER: DeliveryType[] = ['courier', 'pickup'];
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
    const availableDeliveries = ref<DeliveryType[]>([]);
    const deliveryLoaded = ref(false);
    const selectedDelivery = ref<DeliveryType>('courier');
    const resultState = ref<ResultState>(null);
    const creditPreview = ref<CreditPreview | null>(null);
    const creditAcknowledged = ref(false);

    const creditWarningVisible = computed(
        () => selectedPayment.value === 'deferred' && creditPreview.value?.exceeded === true,
    );
    const canPlaceOrder = computed(
        () =>
            selectedPayment.value !== null &&
            (!creditWarningVisible.value || creditAcknowledged.value),
    );

    function setCreditPreview(next: CreditPreview | null): void {
        const prev = creditPreview.value;
        const changed =
            prev?.availableCredit !== next?.availableCredit ||
            prev?.orderAmount !== next?.orderAmount;
        if (!next?.exceeded || changed) creditAcknowledged.value = false;
        creditPreview.value = next;
    }

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

    async function loadDeliveryMethods(): Promise<void> {
        const { eligibleShippingMethods } = await shopApi(
            EligibleShippingMethodsForCheckoutDocument,
        );
        const codes = new Set(eligibleShippingMethods.map(m => m.code));
        availableDeliveries.value = DELIVERY_ORDER.filter(t =>
            codes.has(SHIPPING_CODE_BY_DELIVERY[t]),
        );
        if (!availableDeliveries.value.includes(selectedDelivery.value)) {
            selectedDelivery.value = availableDeliveries.value[0] ?? 'pickup';
        }
        deliveryLoaded.value = true;
    }

    const deliveryBlocker = computed<string | null>(() => {
        if (!deliveryLoaded.value) return null;
        if (!availableDeliveries.value.includes(selectedDelivery.value)) {
            return 'Selected delivery type is not available for this order';
        }
        if (selectedDelivery.value === 'courier' && !useAuthStore().tradingPoint) {
            return 'Select a trading point to use courier delivery';
        }
        return null;
    });

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
        availableDeliveries.value = [];
        deliveryLoaded.value = false;
        selectedDelivery.value = 'courier';
        resultState.value = null;
        creditPreview.value = null;
        creditAcknowledged.value = false;
    }

    return {
        availableMethods,
        methodsLoaded,
        selectedPayment,
        availableDeliveries,
        deliveryLoaded,
        deliveryBlocker,
        selectedDelivery,
        resultState,
        creditPreview,
        creditAcknowledged,
        creditWarningVisible,
        canPlaceOrder,
        setCreditPreview,
        loadPaymentMethods,
        loadDeliveryMethods,
        setPayment,
        setDelivery,
        setResultState,
        reset,
    };
});
