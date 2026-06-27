<script setup lang="ts">
import { computed } from 'vue';
import { useCheckoutStore } from '../../stores/checkout';
import { useAuthStore } from '../../stores/auth';

const checkoutStore = useCheckoutStore();
const authStore = useAuthStore();

const tradingPointAddress = computed(() =>
    authStore.tradingPoint?.address ?? 'Trading point not selected',
);
</script>

<template>
    <article class="delivery-selector">
        <div class="delivery-selector__head">
            <div>
                <h2 class="delivery-selector__title">Delivery</h2>
                <p class="delivery-selector__subtitle">Delivery to your current trading point.</p>
            </div>
            <button class="delivery-selector__change-btn" type="button">Change point</button>
        </div>
        <div class="delivery-selector__grid">
            <button
                class="delivery-selector__card"
                :class="{ 'delivery-selector__card--active': checkoutStore.selectedDelivery === 'courier' }"
                type="button"
                @click="checkoutStore.setDelivery('courier')"
            >
                <div class="delivery-selector__card-title">
                    <span>🚚</span> Courier
                </div>
                <p class="delivery-selector__card-note">{{ tradingPointAddress }} · today until 18:00 · per contract terms.</p>
            </button>
            <button
                class="delivery-selector__card"
                :class="{ 'delivery-selector__card--active': checkoutStore.selectedDelivery === 'pickup' }"
                type="button"
                @click="checkoutStore.setDelivery('pickup')"
            >
                <div class="delivery-selector__card-title">
                    <span>🏬</span> Self-pickup
                </div>
                <p class="delivery-selector__card-note">Central warehouse · available after assembly confirmation.</p>
            </button>
        </div>
    </article>
</template>

<style scoped>
.delivery-selector {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 22px;
}

.delivery-selector__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    margin-bottom: 16px;
}

.delivery-selector__title {
    margin: 0 0 5px;
    font-size: 24px;
    letter-spacing: -0.045em;
}

.delivery-selector__subtitle {
    margin: 0;
    color: #66736e;
    font-size: 14px;
}

.delivery-selector__change-btn {
    border: 0;
    min-height: 40px;
    border-radius: 13px;
    padding: 0 14px;
    background: #f3f8f6;
    color: #263732;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    font: inherit;
    flex: 0 0 auto;
}

.delivery-selector__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.delivery-selector__card {
    border: 1px solid #dde7e2;
    border-radius: 20px;
    padding: 16px;
    background: #fff;
    display: grid;
    gap: 8px;
    cursor: pointer;
    text-align: left;
    font: inherit;
    transition: 0.16s ease;
}

.delivery-selector__card--active {
    border: 2px solid #00a878;
    background: linear-gradient(135deg, #fff, #f3fff7);
}

.delivery-selector__card-title {
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
}

.delivery-selector__card-note {
    margin: 0;
    color: #66736e;
    font-size: 13px;
    line-height: 1.4;
}

@media (max-width: 900px) {
    .delivery-selector__grid { grid-template-columns: 1fr; }
}
</style>
