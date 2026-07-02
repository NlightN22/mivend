<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { MvModal } from '@mivend/ui-kit';
import { useCheckoutStore } from '../../stores/checkout';
import { useAuthStore } from '../../stores/auth';
import { shopApi } from '../../api/client';

const checkoutStore = useCheckoutStore();
const authStore = useAuthStore();

const tradingPointName = computed(() => authStore.tradingPoint?.name ?? 'Trading point not selected');
const tradingPointAddress = computed(() => authStore.tradingPoint?.address ?? '');

// ── Change point modal ──────────────────────────────────────────────────────

interface PointOption {
    id: string;
    name: string;
    address: string;
}

const modalOpen = ref(false);
const points = ref<PointOption[]>([]);
const loadingPoints = ref(false);
const savingId = ref<string | null>(null);

async function openModal(): Promise<void> {
    modalOpen.value = true;
    if (points.value.length) return;
    loadingPoints.value = true;
    try {
        const result = await shopApi<{ myTradingPoints: PointOption[] }>(
            `{ myTradingPoints { id name address } }`,
        );
        points.value = result.myTradingPoints ?? [];
    } finally {
        loadingPoints.value = false;
    }
}

async function selectPoint(id: string): Promise<void> {
    if (savingId.value) return;
    savingId.value = id;
    try {
        await shopApi(`mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`, { id });
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
                <p class="delivery-selector__subtitle">
                    Delivery to your current trading point.
                </p>
            </div>
            <button class="delivery-selector__change-btn" type="button" @click="openModal">
                Change point
            </button>
        </div>
        <div class="delivery-selector__grid">
            <button
                class="delivery-selector__card"
                :class="{ 'delivery-selector__card--active': checkoutStore.selectedDelivery === 'courier' }"
                type="button"
                @click="checkoutStore.setDelivery('courier')"
            >
                <div class="delivery-selector__card-title"><span>🚚</span> Courier</div>
                <p class="delivery-selector__card-note">
                    {{ tradingPointAddress || tradingPointName }} · today until 18:00 · per contract terms.
                </p>
            </button>
            <button
                class="delivery-selector__card"
                :class="{ 'delivery-selector__card--active': checkoutStore.selectedDelivery === 'pickup' }"
                type="button"
                @click="checkoutStore.setDelivery('pickup')"
            >
                <div class="delivery-selector__card-title"><span>🏬</span> Self-pickup</div>
                <p class="delivery-selector__card-note">
                    Central warehouse · available after assembly confirmation.
                </p>
            </button>
        </div>
    </article>

    <MvModal v-if="modalOpen" title="Select trading point" @close="modalOpen = false">
        <div v-if="loadingPoints" class="ds-modal-loading">Loading…</div>
        <div v-else-if="!points.length" class="ds-modal-empty">No trading points found.</div>
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
                    <span v-if="pt.id === currentId">✓</span>
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

.delivery-selector__change-btn:hover { background: #e6f0ec; }

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

.ds-point-item:hover { background: #f3f8f6; border-color: #b0ccbf; }

.ds-point-item--active {
    border-color: #00a878;
    background: linear-gradient(135deg, #fff, #f3fff7);
}

.ds-point-item--saving { opacity: 0.6; pointer-events: none; }

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
    .delivery-selector__grid { grid-template-columns: 1fr; }
}
</style>
