<script setup lang="ts">
import { ref, computed } from 'vue';
import { IconBuildingStore, IconMapPin, IconTruckDelivery } from '@tabler/icons-vue';
import { useCheckoutStore } from '../../stores/checkout';
import { useAuthStore } from '../../stores/auth';
import TradingPointModal from './TradingPointModal.vue';

const checkoutStore = useCheckoutStore();
const authStore = useAuthStore();

const courierAvailable = computed(() => checkoutStore.availableDeliveries.includes('courier'));
const pickupAvailable = computed(() => checkoutStore.availableDeliveries.includes('pickup'));
const addPointLink = { path: '/account/trading-points', query: { redirect: '/checkout' } };
const tradingPoint = computed(() => authStore.tradingPoint);
const showPointStrip = computed(
    () => courierAvailable.value && checkoutStore.selectedDelivery === 'courier',
);
const modalOpen = ref(false);
</script>

<template>
    <article class="delivery-selector">
        <div class="delivery-selector__head">
            <div>
                <h2 class="delivery-selector__title">{{ $t('delivery.title') }}</h2>
                <p class="delivery-selector__subtitle">{{ $t('delivery.subtitle') }}</p>
            </div>
        </div>
        <div class="delivery-selector__grid">
            <button
                class="delivery-selector__card"
                :class="{
                    'delivery-selector__card--active': checkoutStore.selectedDelivery === 'courier',
                    'delivery-selector__card--disabled': !courierAvailable,
                }"
                type="button"
                :disabled="!courierAvailable"
                @click="checkoutStore.setDelivery('courier')"
            >
                <div class="delivery-selector__card-title">
                    <IconTruckDelivery :size="20" stroke-width="1.7" aria-hidden="true" />
                    {{ $t('delivery.courier') }}
                </div>
                <p v-if="!courierAvailable" class="delivery-selector__card-note">
                    {{ $t('delivery.courierNeedsPoint') }}
                    <RouterLink :to="addPointLink">{{ $t('delivery.addPoint') }}</RouterLink>
                </p>
                <p v-else class="delivery-selector__card-note">
                    {{ $t('delivery.courierNote') }}
                </p>
            </button>
            <button
                class="delivery-selector__card"
                :class="{
                    'delivery-selector__card--active': checkoutStore.selectedDelivery === 'pickup',
                    'delivery-selector__card--disabled': !pickupAvailable,
                }"
                type="button"
                :disabled="!pickupAvailable"
                @click="checkoutStore.setDelivery('pickup')"
            >
                <div class="delivery-selector__card-title">
                    <IconBuildingStore :size="20" stroke-width="1.7" aria-hidden="true" />
                    {{ $t('delivery.pickup') }}
                </div>
                <p class="delivery-selector__card-note">
                    {{ $t('delivery.pickupNote') }}
                </p>
            </button>
        </div>
        <div v-if="showPointStrip" class="delivery-selector__point">
            <IconMapPin
                class="delivery-selector__point-icon"
                :size="22"
                stroke-width="1.7"
                aria-hidden="true"
            />
            <div class="delivery-selector__point-body">
                <div class="delivery-selector__point-label">
                    {{ $t('delivery.point') }}
                </div>
                <div class="delivery-selector__point-name">
                    {{ tradingPoint?.name ?? $t('delivery.notSelected') }}
                </div>
                <div v-if="tradingPoint?.address" class="delivery-selector__point-addr">
                    {{ tradingPoint.address }}
                </div>
            </div>
            <button class="delivery-selector__change-btn" type="button" @click="modalOpen = true">
                {{ $t('delivery.change') }}
            </button>
        </div>
        <p v-if="checkoutStore.deliveryBlocker" class="delivery-selector__blocker">
            {{ checkoutStore.deliveryBlocker }}
        </p>
    </article>

    <TradingPointModal v-if="modalOpen" :add-point-link="addPointLink" @close="modalOpen = false" />
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

.delivery-selector__change-btn:hover {
    background: #e6f0ec;
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

.delivery-selector__point {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    background: #f3fff7;
    border: 1px solid #cdeedd;
}

.delivery-selector__point-icon {
    flex: 0 0 auto;
    color: #00a878;
}

.delivery-selector__point-body {
    flex: 1 1 auto;
    min-width: 0;
}

.delivery-selector__point-label {
    font-size: 12px;
    color: #66736e;
}

.delivery-selector__point-name {
    font-size: 14px;
    font-weight: 800;
    color: #14231f;
}

.delivery-selector__point-addr {
    font-size: 13px;
    color: #66736e;
}

.delivery-selector__card--disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.delivery-selector__blocker {
    margin: 12px 0 0;
    color: #b42318;
    font-size: 13px;
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
    .delivery-selector__grid {
        grid-template-columns: 1fr;
    }
}
</style>
