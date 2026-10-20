<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { formatMoney } from '../../i18n/format';
import { MvNotImplemented, formatDocumentNumber, toast } from '@mivend/ui-kit';
import { IconAlertTriangle, IconCheck, IconHourglass, IconLock, IconX } from '@tabler/icons-vue';
import { useCartStore } from '../../stores/cart';
import { useCheckoutStore } from '../../stores/checkout';
import { useDemoMode } from '../../composables/useDemoMode';

const { t } = useI18n();
const router = useRouter();
const { demoAllowed } = useDemoMode();
const cartStore = useCartStore();
const checkoutStore = useCheckoutStore();

const orderCode = computed(() => (cartStore.isEmpty ? null : (cartStore.order?.code ?? null)));
const orderSummary = computed(() => {
    if (!orderCode.value) return null;
    const amount = checkoutStore.creditPreview?.payableCardAmount ?? cartStore.totalPrice;
    return t('paymentStub.order', {
        number: formatDocumentNumber(orderCode.value),
        amount: formatMoney(amount),
    });
});

onMounted(() => {
    if (demoAllowed && !cartStore.loaded) void cartStore.fetchCart();
});

async function choose(status: 'success' | 'pending' | 'fail'): Promise<void> {
    const code = orderCode.value;
    if (!code) return;
    const outcome = await cartStore.completeOnlinePayment(status);
    if (outcome === 'amount-changed') {
        toast(t('paymentStub.amountChanged'), 'error');
        router.push('/checkout');
        return;
    }
    router.push({ path: '/payment-result', query: { status, order: code } });
}
</script>

<template>
    <div class="stub-page">
        <MvNotImplemented
            v-if="!demoAllowed"
            :title="t('common.notImplemented.title')"
            :message="t('common.notImplemented.message')"
        />
        <div v-else class="stub-card">
            <div class="stub-lock">
                <IconLock :size="30" stroke-width="1.8" aria-hidden="true" />
            </div>
            <h1 class="stub-title">{{ $t('paymentStub.title') }}</h1>
            <p class="stub-subtitle">{{ $t('paymentStub.subtitle') }}</p>

            <div class="stub-warning">
                <IconAlertTriangle :size="16" stroke-width="2" aria-hidden="true" />
                {{ $t('paymentStub.warning') }}
            </div>

            <div v-if="orderSummary" class="stub-order">{{ orderSummary }}</div>
            <div v-else-if="cartStore.loaded" class="stub-order">
                {{ $t('paymentStub.noOrder') }}
            </div>

            <div class="stub-actions">
                <button
                    class="stub-btn stub-btn--green"
                    :disabled="!orderCode"
                    @click="choose('success')"
                >
                    <IconCheck :size="18" stroke-width="2.5" aria-hidden="true" />
                    {{ $t('paymentStub.success') }}
                </button>
                <button
                    class="stub-btn stub-btn--orange"
                    :disabled="!orderCode"
                    @click="choose('pending')"
                >
                    <IconHourglass :size="18" stroke-width="2.2" aria-hidden="true" />
                    {{ $t('paymentStub.pending') }}
                </button>
                <button
                    class="stub-btn stub-btn--red"
                    :disabled="!orderCode"
                    @click="choose('fail')"
                >
                    <IconX :size="18" stroke-width="2.5" aria-hidden="true" />
                    {{ $t('paymentStub.fail') }}
                </button>
            </div>

            <RouterLink to="/checkout" class="stub-back">{{ $t('paymentStub.back') }}</RouterLink>
        </div>
    </div>
</template>

<style scoped>
.stub-page {
    min-height: 100vh;
    background: #f4f7f5;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
}

.stub-card {
    width: 100%;
    max-width: 480px;
    background: #fff;
    border-radius: 24px;
    padding: 36px 32px 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
}

.stub-lock {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #e2f8ef;
    display: grid;
    place-items: center;
    font-size: 28px;
    margin-bottom: 14px;
}

.stub-title {
    margin: 0 0 6px;
    font-size: 28px;
    font-weight: 950;
    letter-spacing: -0.045em;
}

.stub-subtitle {
    margin: 0 0 20px;
    color: #66736e;
    font-size: 14px;
}

.stub-warning {
    width: 100%;
    background: #fff8e0;
    border: 1px solid #ffe082;
    border-radius: 14px;
    padding: 12px 14px;
    font-size: 13px;
    color: #7a5500;
    margin-bottom: 18px;
    text-align: left;
}

.stub-order {
    font-size: 15px;
    font-weight: 800;
    color: #263732;
    background: #f4faf7;
    border: 1px solid #dde7e2;
    border-radius: 12px;
    padding: 10px 18px;
    margin-bottom: 22px;
    width: 100%;
}

.stub-actions {
    display: grid;
    gap: 10px;
    width: 100%;
    margin-bottom: 18px;
}

.stub-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 52px;
    border: 0;
    border-radius: 16px;
    font: inherit;
    font-size: 15px;
    font-weight: 800;
    color: #fff;
    cursor: pointer;
    transition: opacity 0.15s;
}
.stub-btn:hover:not(:disabled) {
    opacity: 0.88;
}
.stub-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.stub-btn--green {
    background: #00a878;
    box-shadow: 0 8px 20px rgba(0, 168, 120, 0.22);
}
.stub-btn--orange {
    background: var(--app-accent-orange, #ff8a00);
    box-shadow: 0 8px 20px rgba(255, 138, 0, 0.22);
}
.stub-btn--orange:hover:not(:disabled) {
    background: var(--app-accent-orange-hover, #e67c00);
}
.stub-btn--orange:active:not(:disabled) {
    background: var(--app-accent-orange-active, #cc6e00);
}
.stub-btn--red {
    background: #d92d20;
    box-shadow: 0 8px 20px rgba(217, 45, 32, 0.18);
}

.stub-back {
    font-size: 13px;
    color: #66736e;
    text-decoration: none;
    font-weight: 700;
}
.stub-back:hover {
    color: #263732;
}
</style>
