<script setup lang="ts">
import { useCheckoutStore, type ResultState } from '../../stores/checkout';
import { useRouter } from 'vue-router';

const checkoutStore = useCheckoutStore();
const router = useRouter();

interface StateConfig {
    icon: string;
    variant: 'success' | 'pending' | 'fail';
    title: string;
    text: string;
    actions: { label: string; primary?: boolean; handler: () => void }[];
}

const stateConfig: Record<NonNullable<ResultState>, StateConfig> = {
    success: {
        icon: '✓',
        variant: 'success',
        title: 'Payment accepted',
        text: 'Payment received. Order created and passed for processing. Documents will appear in the documents section after posting.',
        actions: [
            { label: 'Open order', primary: true, handler: () => router.push('/orders') },
            { label: 'Go to documents', handler: () => {} },
            { label: 'Continue shopping', handler: () => router.push('/catalog') },
        ],
    },
    pending: {
        icon: '…',
        variant: 'pending',
        title: 'Awaiting confirmation',
        text: 'You returned to the portal, but the payment service has not yet confirmed the payment. Status will update automatically after webhook.',
        actions: [
            { label: 'Refresh status', primary: true, handler: () => {} },
            { label: 'Open order', handler: () => router.push('/orders') },
            { label: 'Go to balance', handler: () => {} },
        ],
    },
    fail: {
        icon: '×',
        variant: 'fail',
        title: 'Payment failed',
        text: 'Payment not confirmed. You can retry, choose bank invoice, or return to the order.',
        actions: [
            { label: 'Try again', primary: true, handler: () => checkoutStore.setResultState(null) },
            { label: 'Generate invoice', handler: () => checkoutStore.setResultState(null) },
            { label: 'Back to order', handler: () => checkoutStore.setResultState(null) },
        ],
    },
};
</script>

<template>
    <div v-if="checkoutStore.resultState" class="checkout-result">
        <div class="checkout-result__card">
            <div
                class="checkout-result__icon"
                :class="`checkout-result__icon--${stateConfig[checkoutStore.resultState].variant}`"
            >{{ stateConfig[checkoutStore.resultState].icon }}</div>

            <div class="checkout-result__title">{{ stateConfig[checkoutStore.resultState].title }}</div>
            <p class="checkout-result__text">{{ stateConfig[checkoutStore.resultState].text }}</p>

            <div class="checkout-result__actions">
                <button
                    v-for="action in stateConfig[checkoutStore.resultState].actions"
                    :key="action.label"
                    class="checkout-result__btn"
                    :class="{ 'checkout-result__btn--primary': action.primary }"
                    type="button"
                    @click="action.handler()"
                >{{ action.label }}</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.checkout-result { max-width: 900px; margin: 0 auto; }

.checkout-result__card {
    text-align: center;
    padding: 42px 28px;
    border-radius: 34px;
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
}

.checkout-result__icon {
    width: 76px;
    height: 76px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 38px;
    font-weight: 800;
    margin: 0 auto 16px;
    color: #fff;
}

.checkout-result__icon--success {
    background: #00a878;
    box-shadow: 0 14px 28px rgba(0, 168, 120, 0.22);
}

.checkout-result__icon--pending {
    background: #ff8a00;
    box-shadow: 0 14px 28px rgba(255, 138, 0, 0.22);
}

.checkout-result__icon--fail {
    background: #d92d20;
    box-shadow: 0 14px 28px rgba(217, 45, 32, 0.18);
}

.checkout-result__title {
    font-size: clamp(30px, 3.2vw, 44px);
    font-weight: 800;
    letter-spacing: -0.055em;
    margin-bottom: 8px;
}

.checkout-result__text {
    color: #66736e;
    font-size: 15px;
    line-height: 1.5;
    max-width: 620px;
    margin: 0 auto;
}

.checkout-result__actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
}

.checkout-result__btn {
    border: 0;
    min-height: 40px;
    border-radius: 13px;
    padding: 0 18px;
    background: #f3f8f6;
    color: #263732;
    font-weight: 800;
    cursor: pointer;
    font: inherit;
    transition: background 0.15s;
}

.checkout-result__btn:hover { background: #e8f2ed; }

.checkout-result__btn--primary {
    background: #00a878;
    color: #fff;
}

.checkout-result__btn--primary:hover { background: #008a64; }
</style>
