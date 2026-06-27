<script setup lang="ts">
import { useCheckoutStore } from '../../stores/checkout';

const checkoutStore = useCheckoutStore();

const methods = [
    {
        id: 'online' as const,
        icon: '💳',
        title: 'Online payment',
        note: 'Card, SBP or other method via bank/acquiring.',
        badge: 'Quick confirmation',
        badgeOrange: false,
    },
    {
        id: 'invoice' as const,
        icon: '🏦',
        title: 'Bank invoice',
        note: 'Generate PDF invoice and pay via bank.',
        badge: 'Status after receipt',
        badgeOrange: true,
    },
    {
        id: 'deferred' as const,
        icon: '⏱',
        title: 'Deferred payment',
        note: 'Available per contract terms and limit.',
        badge: 'Limit available',
        badgeOrange: false,
    },
];
</script>

<template>
    <article class="payment-selector">
        <div class="payment-selector__head">
            <h2 class="payment-selector__title">Payment method</h2>
            <p class="payment-selector__subtitle">Choose how to pay for the order.</p>
        </div>
        <div class="payment-selector__grid">
            <button
                v-for="method in methods"
                :key="method.id"
                class="payment-selector__card"
                :class="{ 'payment-selector__card--active': checkoutStore.selectedPayment === method.id }"
                type="button"
                @click="checkoutStore.setPayment(method.id)"
            >
                <div class="payment-selector__card-top">
                    <div class="payment-selector__icon">{{ method.icon }}</div>
                    <div class="payment-selector__radio"></div>
                </div>
                <div>
                    <div class="payment-selector__method-title">{{ method.title }}</div>
                    <div class="payment-selector__method-note">{{ method.note }}</div>
                </div>
                <span
                    class="payment-selector__badge"
                    :class="{ 'payment-selector__badge--orange': method.badgeOrange }"
                >{{ method.badge }}</span>
            </button>
        </div>
    </article>
</template>

<style scoped>
.payment-selector {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 22px;
}

.payment-selector__head { margin-bottom: 16px; }

.payment-selector__title {
    margin: 0 0 5px;
    font-size: 24px;
    letter-spacing: -0.045em;
}

.payment-selector__subtitle {
    margin: 0;
    color: #66736e;
    font-size: 14px;
}

.payment-selector__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.payment-selector__card {
    min-height: 132px;
    padding: 16px;
    border: 1px solid #dde7e2;
    border-radius: 20px;
    background: #fff;
    display: grid;
    gap: 11px;
    cursor: pointer;
    transition: 0.16s ease;
    position: relative;
    text-align: left;
    font: inherit;
}

.payment-selector__card:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(27, 45, 38, 0.06);
}

.payment-selector__card--active {
    border: 2px solid #00a878;
    background: linear-gradient(135deg, #ffffff, #f3fff7);
}

.payment-selector__card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.payment-selector__icon {
    width: 42px;
    height: 42px;
    border-radius: 15px;
    background: #eaf4ff;
    color: #1f65b2;
    display: grid;
    place-items: center;
    font-size: 20px;
}

.payment-selector__card--active .payment-selector__icon {
    background: #00a878;
}

.payment-selector__radio {
    width: 20px;
    height: 20px;
    border: 2px solid #bccac4;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
}

.payment-selector__card--active .payment-selector__radio {
    border-color: #00a878;
}

.payment-selector__card--active .payment-selector__radio::after {
    content: '';
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #00a878;
}

.payment-selector__method-title {
    font-weight: 800;
    line-height: 1.2;
    font-size: 14px;
    margin-bottom: 4px;
}

.payment-selector__method-note {
    color: #66736e;
    font-size: 13px;
    line-height: 1.35;
}

.payment-selector__badge {
    min-height: 26px;
    display: inline-flex;
    align-items: center;
    width: fit-content;
    border-radius: 999px;
    padding: 0 9px;
    background: #e2f8ef;
    color: #008a64;
    font-size: 12px;
    font-weight: 800;
}

.payment-selector__badge--orange {
    background: #fff5df;
    color: #e87800;
}

@media (max-width: 900px) {
    .payment-selector__grid { grid-template-columns: 1fr; }
}
</style>
