import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { PaymentForm } from 'shared';
import { shopApi } from '../api/client';
import { EligibleShippingMethodsForCheckoutDocument } from '../api/generated/graphql';
import {
    acknowledgementNeeded,
    orderedForms,
    waitsForManager,
    type CreditPolicyPreview,
} from '../utils/checkoutPolicy';
import { SHIPPING_CODE_BY_DELIVERY, type DeliveryType } from '../utils/deliveryMethods';
import { useAuthStore } from './auth';
import { i18n } from '../i18n';

export interface CreditPreview extends CreditPolicyPreview {
    availableCredit: number;
    orderAmount: number;
}

export type { DeliveryType, PaymentForm };

const DELIVERY_ORDER: DeliveryType[] = ['courier', 'pickup'];

export const useCheckoutStore = defineStore('checkout', () => {
    const selectedPayment = ref<PaymentForm | null>(null);
    const availableDeliveries = ref<DeliveryType[]>([]);
    const deliveryLoaded = ref(false);
    const selectedDelivery = ref<DeliveryType>('courier');
    const creditPreview = ref<CreditPreview | null>(null);
    const creditAcknowledged = ref(false);
    const creditPreviewReady = ref(false);

    const availableMethods = computed<PaymentForm[]>(() =>
        orderedForms(creditPreview.value?.availableForms ?? []),
    );
    const methodsLoaded = computed(() => creditPreviewReady.value);
    const acknowledgementRequired = computed(() =>
        acknowledgementNeeded(creditPreview.value, selectedPayment.value),
    );
    const creditWarningVisible = acknowledgementRequired;
    const waitsForManagerConfirmation = computed(() =>
        waitsForManager(creditPreview.value, selectedPayment.value),
    );
    const canPlaceOrder = computed(
        () =>
            selectedPayment.value !== null &&
            creditPreviewReady.value &&
            (!acknowledgementRequired.value || creditAcknowledged.value),
    );

    function setCreditPreview(next: CreditPreview | null): void {
        const prev = creditPreview.value;
        const changed =
            prev?.availableCredit !== next?.availableCredit ||
            prev?.orderAmount !== next?.orderAmount;
        if (!next?.acknowledgementRequired || changed) creditAcknowledged.value = false;
        creditPreview.value = next;
        creditPreviewReady.value = true;
        const forms = availableMethods.value;
        if (!selectedPayment.value || !forms.includes(selectedPayment.value)) {
            selectedPayment.value = forms[0] ?? null;
        }
    }

    function markCreditPreviewPending(): void {
        creditPreviewReady.value = false;
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
            return i18n.global.t('cartErrors.deliveryUnavailable');
        }
        if (selectedDelivery.value === 'courier' && !useAuthStore().tradingPoint) {
            return i18n.global.t('delivery.courierNeedsPointBlocker');
        }
        return null;
    });

    function setPayment(method: PaymentForm): void {
        selectedPayment.value = method;
    }

    function setDelivery(type: DeliveryType): void {
        selectedDelivery.value = type;
    }

    function reset(): void {
        selectedPayment.value = null;
        availableDeliveries.value = [];
        deliveryLoaded.value = false;
        selectedDelivery.value = 'courier';
        creditPreview.value = null;
        creditAcknowledged.value = false;
        creditPreviewReady.value = false;
    }

    return {
        availableMethods,
        methodsLoaded,
        selectedPayment,
        availableDeliveries,
        deliveryLoaded,
        deliveryBlocker,
        selectedDelivery,
        creditPreview,
        creditAcknowledged,
        creditWarningVisible,
        acknowledgementRequired,
        waitsForManagerConfirmation,
        canPlaceOrder,
        setCreditPreview,
        markCreditPreviewPending,
        loadDeliveryMethods,
        setPayment,
        setDelivery,
        reset,
    };
});
