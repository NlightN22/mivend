<script setup lang="ts">
import { computed } from 'vue';
import { IconCheck, IconHourglass, IconX } from '@tabler/icons-vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PaymentResultDetails from './PaymentResultDetails.vue';

const { t } = useI18n();
const route = useRoute();
const DEMO_ORDER = '348744';
const status = computed(() => {
    const s = route.query.status;
    if (s === 'pending' || s === 'fail') return s;
    return 'success';
});

const config = computed(() => {
    if (status.value === 'success') {
        return {
            icon: IconCheck,
            iconClass: 'pr-icon--green',
            title: t('paymentResult.success.title'),
            text: t('paymentResult.success.text', { number: DEMO_ORDER }),
        };
    }
    if (status.value === 'pending') {
        return {
            icon: IconHourglass,
            iconClass: 'pr-icon--orange',
            title: t('paymentResult.pending.title'),
            text: t('paymentResult.pending.text'),
        };
    }
    return {
        icon: IconX,
        iconClass: 'pr-icon--red',
        title: t('paymentResult.fail.title'),
        text: t('paymentResult.fail.text'),
    };
});
</script>

<template>
    <main class="pr-page">
        <MvBreadcrumbs
            class="pr-crumbs"
            :items="[
                { label: $t('nav.orders'), to: '/orders' },
                { label: $t('paymentResult.title') },
            ]"
        />

        <div class="pr-head">
            <h1 class="pr-title">{{ $t('paymentResult.title') }}</h1>
        </div>

        <div class="pr-status-card" :class="`pr-status-card--${status}`">
            <div class="pr-icon" :class="config.iconClass">
                <component :is="config.icon" :size="32" stroke-width="2.5" aria-hidden="true" />
            </div>
            <h2 class="pr-status-title">{{ config.title }}</h2>
            <p class="pr-status-text">{{ config.text }}</p>

            <div class="pr-actions">
                <template v-if="status === 'success'">
                    <RouterLink to="/orders" class="pr-btn pr-btn--primary">{{
                        $t('orderCreated.openOrder')
                    }}</RouterLink>
                    <a href="#" class="pr-btn pr-btn--secondary">{{
                        $t('paymentResult.downloadReceipt')
                    }}</a>
                    <RouterLink to="/catalog" class="pr-btn pr-btn--ghost">{{
                        $t('orderCreated.continueShopping')
                    }}</RouterLink>
                </template>
                <template v-else-if="status === 'pending'">
                    <RouterLink to="/orders" class="pr-btn pr-btn--primary">{{
                        $t('orderCreated.openOrder')
                    }}</RouterLink>
                    <RouterLink to="/catalog" class="pr-btn pr-btn--ghost">{{
                        $t('orderCreated.continueShopping')
                    }}</RouterLink>
                </template>
                <template v-else>
                    <RouterLink to="/payment-stub" class="pr-btn pr-btn--primary">{{
                        $t('paymentResult.tryAgain')
                    }}</RouterLink>
                    <RouterLink to="/checkout" class="pr-btn pr-btn--secondary">{{
                        $t('paymentResult.anotherMethod')
                    }}</RouterLink>
                    <RouterLink to="/catalog" class="pr-btn pr-btn--ghost">{{
                        $t('orderCreated.continueShopping')
                    }}</RouterLink>
                </template>
            </div>
        </div>

        <PaymentResultDetails :order-number="DEMO_ORDER" />
    </main>
</template>

<style scoped>
.pr-page {
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 70px;
}

.pr-crumbs {
    margin-bottom: 12px;
}
.pr-head {
    margin-bottom: 24px;
}

.pr-title {
    margin: 0;
    font-size: clamp(36px, 3.8vw, 54px);
    line-height: 0.98;
    letter-spacing: -0.06em;
}

.pr-status-card {
    max-width: 600px;
    margin: 0 auto 24px;
    background: #fff;
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 36px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    border: 1.5px solid #dde7e2;
}

.pr-status-card--success {
    border-color: #00a878;
}
.pr-status-card--pending {
    border-color: #ff8a00;
}
.pr-status-card--fail {
    border-color: #d92d20;
}

.pr-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    font-size: 26px;
    font-weight: 900;
    display: grid;
    place-items: center;
    margin-bottom: 16px;
}

.pr-icon--green {
    background: #00a878;
    color: #fff;
}
.pr-icon--orange {
    background: #fff5df;
    color: #e87800;
    font-size: 32px;
}
.pr-icon--red {
    background: #fde8e8;
    color: #d92d20;
}

.pr-status-title {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 950;
    letter-spacing: -0.04em;
}

.pr-status-text {
    margin: 0 0 22px;
    color: #66736e;
    font-size: 14px;
    line-height: 1.5;
}

.pr-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
}

.pr-btn {
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

.pr-btn--primary {
    background: #00a878;
    color: #fff;
}
.pr-btn--primary:hover {
    background: #008a64;
}

.pr-btn--secondary {
    background: #f3f8f6;
    color: #263732;
    border: 1px solid #dde7e2;
}
.pr-btn--secondary:hover {
    background: #e8f2ed;
}

.pr-btn--ghost {
    background: transparent;
    color: #66736e;
    border: 1px solid #dde7e2;
}
.pr-btn--ghost:hover {
    color: #263732;
    background: #f4faf7;
}

@media (max-width: 560px) {
    .pr-page {
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
