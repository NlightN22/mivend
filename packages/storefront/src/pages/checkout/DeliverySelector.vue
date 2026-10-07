<script setup lang="ts">
import { ref, computed } from 'vue';
import { IconBuildingStore, IconCheck, IconMapPin, IconTruckDelivery } from '@tabler/icons-vue';
import { MvModal } from '@mivend/ui-kit';
import { useCheckoutStore } from '../../stores/checkout';
import { useAuthStore } from '../../stores/auth';
import { shopApi } from '../../api/client';
import {
    MyTradingPointsForDeliverySelectorDocument,
    SetPreferredTradingPointForDeliverySelectorDocument,
    type MyTradingPointsForDeliverySelectorQuery,
} from '../../api/generated/graphql';

const checkoutStore = useCheckoutStore();
const authStore = useAuthStore();

const courierAvailable = computed(() => checkoutStore.availableDeliveries.includes('courier'));
const pickupAvailable = computed(() => checkoutStore.availableDeliveries.includes('pickup'));
const tradingPoint = computed(() => authStore.tradingPoint);
const showPointStrip = computed(
    () => courierAvailable.value && checkoutStore.selectedDelivery === 'courier',
);

// ── Change point modal ──────────────────────────────────────────────────────

type PointOption = MyTradingPointsForDeliverySelectorQuery['myTradingPoints'][number];

const modalOpen = ref(false);
const points = ref<PointOption[]>([]);
const loadingPoints = ref(false);
const savingId = ref<string | null>(null);

async function openModal(): Promise<void> {
    modalOpen.value = true;
    loadingPoints.value = true;
    try {
        const result = await shopApi(MyTradingPointsForDeliverySelectorDocument);
        points.value = result.myTradingPoints ?? [];
    } finally {
        loadingPoints.value = false;
    }
}

async function selectPoint(id: string): Promise<void> {
    if (savingId.value) return;
    savingId.value = id;
    try {
        await shopApi(SetPreferredTradingPointForDeliverySelectorDocument, { id });
        await authStore.fetchCurrentCustomer();
        modalOpen.value = false;
    } finally {
        savingId.value = null;
    }
}

const currentId = computed(() => authStore.customer?.customFields?.preferredTradingPointId ?? null);
</script>

<template>
    <article class="delivery-selector">
        <div class="delivery-selector__head">
            <div>
                <h2 class="delivery-selector__title">Delivery</h2>
                <p class="delivery-selector__subtitle">Choose delivery method for your order.</p>
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
                    <IconTruckDelivery :size="20" stroke-width="1.7" aria-hidden="true" /> Courier
                </div>
                <p v-if="!courierAvailable" class="delivery-selector__card-note">
                    Courier delivery needs a trading point.
                    <RouterLink to="/account/trading-points">Add trading point</RouterLink>
                </p>
                <p v-else class="delivery-selector__card-note">
                    Delivery to the trading point, per contract terms.
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
                    Self-pickup
                </div>
                <p class="delivery-selector__card-note">Available after assembly confirmation.</p>
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
                <div class="delivery-selector__point-label">Trading point for delivery</div>
                <div class="delivery-selector__point-name">
                    {{ tradingPoint?.name ?? 'Not selected' }}
                </div>
                <div v-if="tradingPoint?.address" class="delivery-selector__point-addr">
                    {{ tradingPoint.address }}
                </div>
            </div>
            <button class="delivery-selector__change-btn" type="button" @click="openModal">
                Change
            </button>
        </div>
        <p v-if="checkoutStore.deliveryBlocker" class="delivery-selector__blocker">
            {{ checkoutStore.deliveryBlocker }}
        </p>
    </article>

    <MvModal v-if="modalOpen" title="Select trading point" @close="modalOpen = false">
        <div v-if="loadingPoints" class="ds-modal-loading">Loading…</div>
        <div v-else-if="!points.length" class="ds-modal-empty">
            No trading points found.
            <RouterLink to="/account/trading-points">Add trading point</RouterLink>
        </div>
        <ul v-else class="ds-point-list">
            <li
                v-for="pt in points"
                :key="pt.id"
                class="ds-point-item"
                :class="{
                    'ds-point-item--active': pt.id === currentId,
                    'ds-point-item--saving': savingId === pt.id,
                }"
                @click="selectPoint(pt.id)"
            >
                <div class="ds-point-item__check">
                    <IconCheck
                        v-if="pt.id === currentId"
                        :size="14"
                        stroke-width="3"
                        aria-hidden="true"
                    />
                </div>
                <div>
                    <div class="ds-point-item__name">{{ pt.name }}</div>
                    <div class="ds-point-item__addr">{{ pt.address }}</div>
                </div>
            </li>
        </ul>
    </MvModal>
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

/* Modal content */
.ds-modal-loading,
.ds-modal-empty {
    text-align: center;
    padding: 24px 0;
    color: #66736e;
    font-size: 14px;
}

.ds-point-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
}

.ds-point-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid #dde7e2;
    border-radius: 16px;
    cursor: pointer;
    transition: 0.14s ease;
}

.ds-point-item:hover {
    background: #f3f8f6;
    border-color: #b0ccbf;
}

.ds-point-item--active {
    border-color: #00a878;
    background: linear-gradient(135deg, #fff, #f3fff7);
}

.ds-point-item--saving {
    opacity: 0.6;
    pointer-events: none;
}

.ds-point-item__check {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #dde7e2;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #00a878;
    flex-shrink: 0;
}

.ds-point-item--active .ds-point-item__check {
    border-color: #00a878;
    background: #00a878;
    color: #fff;
}

.ds-point-item__name {
    font-size: 14px;
    font-weight: 800;
    color: #14231f;
    margin-bottom: 2px;
}

.ds-point-item__addr {
    font-size: 13px;
    color: #66736e;
}

@media (max-width: 900px) {
    .delivery-selector__grid {
        grid-template-columns: 1fr;
    }
}
</style>
