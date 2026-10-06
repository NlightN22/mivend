<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MvErrorState } from '@mivend/ui-kit';
import { shopApi } from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { describeLoadError, type LoadErrorText } from '../../api/describeLoadError';
import { OrderCreatedDocument, type OrderCreatedQuery } from '../../api/generated/graphql';

const route = useRoute();
const authStore = useAuthStore();
const router = useRouter();
const code = computed(() => (typeof route.query.code === 'string' ? route.query.code : ''));

const data = ref<OrderCreatedQuery | null>(null);
const loading = ref(true);
const error = ref<LoadErrorText | null>(null);

const order = computed(() => data.value?.orderByCode ?? null);
const payment = computed(() => order.value?.payments?.[0] ?? null);
const methodCode = computed(() => payment.value?.method ?? '');

const PAYMENT_LABELS: Record<string, string> = {
    'offline-terms': 'Bank invoice',
    'deferred-payment': 'Deferred payment',
    'online-stub': 'Online payment',
};
const paymentLabel = computed(() => PAYMENT_LABELS[methodCode.value] ?? methodCode.value);

const limitExceeded = computed(() => {
    const meta = payment.value?.metadata as { public?: { creditLimitExceeded?: boolean } } | null;
    return meta?.public?.creditLimitExceeded === true;
});

const tradingPoint = computed(() => {
    const id = order.value?.customFields?.tradingPointId;
    if (!id) return null;
    const point =
        data.value?.myTradingPoints?.find(p => p.id === id) ??
        (authStore.tradingPoint?.id === id ? authStore.tradingPoint : null);
    return point ? (point.address ?? point.name) : null;
});

const delivery = computed(() => order.value?.shippingLines?.[0]?.shippingMethod.name ?? null);
const placedAt = computed(() =>
    order.value?.orderPlacedAt
        ? new Intl.DateTimeFormat('en-GB', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          }).format(new Date(order.value.orderPlacedAt))
        : null,
);
const invoiceId = computed(
    () => data.value?.myInvoices.items.find(i => i.order?.code === code.value)?.id ?? null,
);

const statusText = computed(() => {
    const ref = `Your order ${code.value} has been created`;
    if (methodCode.value === 'deferred-payment')
        return `${ref} and will be processed under your deferred payment terms.`;
    if (methodCode.value === 'offline-terms')
        return `${ref}. Pay the invoice via your bank; the order will be reserved once payment is received.`;
    return `${ref}.`;
});

const steps = computed(() =>
    methodCode.value === 'offline-terms'
        ? [
              'Download and send the invoice to your bank.',
              "We'll reserve the goods when payment arrives.",
              "You'll get a notification when the order is ready.",
          ]
        : [
              'Your order is queued for processing.',
              'Goods will be reserved.',
              "You'll get a notification when the order is ready.",
          ],
);

async function load(): Promise<void> {
    if (!code.value) {
        await router.replace('/orders');
        return;
    }
    loading.value = true;
    error.value = null;
    try {
        data.value = await shopApi(OrderCreatedDocument, { code: code.value });
    } catch (e) {
        error.value = describeLoadError(e);
    } finally {
        loading.value = false;
    }
}

onMounted(load);
</script>

<template>
    <main class="oc-page">
        <MvBreadcrumbs
            class="oc-crumbs"
            :items="[
                { label: 'Cart', to: '/cart' },
                { label: 'Checkout', to: '/checkout' },
                { label: 'Order placed' },
            ]"
        />

        <div class="oc-head">
            <h1 class="oc-title">Order placed</h1>
        </div>

        <div v-if="loading" class="oc-state">Loading order…</div>
        <MvErrorState
            v-else-if="error"
            :title="error.title"
            :message="error.message"
            @retry="load"
        />
        <MvNotice v-else-if="!order" variant="error">Order not found</MvNotice>

        <template v-else>
            <div class="oc-status-card">
                <div class="oc-check">✓</div>
                <h2 class="oc-status-title">Order created</h2>
                <p class="oc-status-text">{{ statusText }}</p>
                <MvNotice v-if="limitExceeded" variant="warning">
                    Your credit limit is exceeded. Please wait for your manager to confirm the
                    order.
                </MvNotice>
                <div class="oc-actions">
                    <RouterLink :to="`/orders/${order.id}`" class="oc-btn oc-btn--primary"
                        >Open order</RouterLink
                    >
                    <RouterLink
                        v-if="invoiceId"
                        :to="`/invoices/${invoiceId}`"
                        class="oc-btn oc-btn--secondary"
                        >Open invoice</RouterLink
                    >
                    <RouterLink to="/catalog" class="oc-btn oc-btn--ghost"
                        >Continue shopping</RouterLink
                    >
                </div>
            </div>

            <div class="oc-details-grid">
                <div class="oc-card">
                    <h3 class="oc-card-title">Order details</h3>
                    <div class="oc-detail-list">
                        <div class="oc-detail">
                            <span>Order number</span><strong>{{ order.code }}</strong>
                        </div>
                        <div v-if="placedAt" class="oc-detail">
                            <span>Date</span><strong>{{ placedAt }}</strong>
                        </div>
                        <div v-if="tradingPoint" class="oc-detail">
                            <span>Trading point</span><strong>{{ tradingPoint }}</strong>
                        </div>
                        <div class="oc-detail">
                            <span>Payment method</span><strong>{{ paymentLabel }}</strong>
                        </div>
                        <div v-if="delivery" class="oc-detail">
                            <span>Delivery</span><strong>{{ delivery }}</strong>
                        </div>
                    </div>
                </div>

                <div class="oc-card">
                    <h3 class="oc-card-title">What's next</h3>
                    <ol class="oc-steps">
                        <li v-for="(step, i) in steps" :key="i" class="oc-step">
                            <span class="oc-step-num">{{ i + 1 }}</span>
                            <span>{{ step }}</span>
                        </li>
                    </ol>
                </div>
            </div>
        </template>
    </main>
</template>

<style scoped>
.oc-state {
    padding: 40px 0;
    color: #66736e;
}

.oc-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 70px;
}

.oc-crumbs {
    margin-bottom: 12px;
}

.oc-head {
    margin-bottom: 24px;
}

.oc-title {
    margin: 0;
    font-size: clamp(36px, 3.8vw, 54px);
    line-height: 0.98;
    letter-spacing: -0.06em;
}

.oc-status-card {
    max-width: 600px;
    margin: 0 auto 24px;
    background: #fff;
    border: 1.5px solid #00a878;
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 36px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
}

.oc-check {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #00a878;
    color: #fff;
    font-size: 28px;
    font-weight: 900;
    display: grid;
    place-items: center;
    margin-bottom: 16px;
}

.oc-status-title {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 950;
    letter-spacing: -0.04em;
}

.oc-status-text {
    margin: 0 0 22px;
    color: #66736e;
    font-size: 14px;
    line-height: 1.5;
}

.oc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
}

.oc-btn {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 20px;
    border-radius: 14px;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
    transition: 0.14s;
    border: none;
}

.oc-btn--primary {
    background: #00a878;
    color: #fff;
}
.oc-btn--primary:hover {
    background: #008a64;
}

.oc-btn--secondary {
    background: #f3f8f6;
    color: #263732;
    border: 1px solid #dde7e2;
}
.oc-btn--secondary:hover {
    background: #e8f2ed;
}

.oc-btn--ghost {
    background: transparent;
    color: #66736e;
    border: 1px solid #dde7e2;
}
.oc-btn--ghost:hover {
    color: #263732;
    background: #f4faf7;
}

.oc-details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    max-width: 900px;
    margin: 0 auto;
}

.oc-card {
    background: #fff;
    border: 1px solid #dde7e2;
    border-radius: 24px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 22px;
}

.oc-card-title {
    margin: 0 0 14px;
    font-size: 17px;
    font-weight: 950;
    letter-spacing: -0.03em;
}

.oc-detail-list {
    display: grid;
    gap: 10px;
}

.oc-detail {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 14px;
    color: #66736e;
    padding-bottom: 10px;
    border-bottom: 1px solid #edf2ef;
}

.oc-detail:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.oc-detail strong {
    color: #14231f;
    font-weight: 700;
    text-align: right;
}

.oc-steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 14px;
}

.oc-step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 14px;
    color: #263732;
    line-height: 1.4;
}

.oc-step-num {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #e2f8ef;
    color: #008a64;
    font-size: 13px;
    font-weight: 900;
    display: grid;
    place-items: center;
}

@media (max-width: 760px) {
    .oc-details-grid {
        grid-template-columns: 1fr;
    }
    .oc-page {
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
