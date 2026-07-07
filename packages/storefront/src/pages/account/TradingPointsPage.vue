<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth';
import AccountSidebar from './AccountSidebar.vue';
import TradingPointCard from './TradingPointCard.vue';
import TradingPointAddForm from './TradingPointAddForm.vue';
import TradingPointRemovedList from './TradingPointRemovedList.vue';
import { useTradingPoints } from './useTradingPoints';

const authStore = useAuthStore();
const preferredId = computed(() => authStore.customer?.customFields?.preferredTradingPointId ?? null);

const {
    visiblePoints,
    hiddenPoints,
    showHidden,
    loading,
    addOpen,
    addSaving,
    addForm,
    loadPoints,
    handleSave,
    handleRemove,
    handleRestore,
    handleSetCurrent,
    openAdd,
    submitAdd,
} = useTradingPoints();

onMounted(loadPoints);
</script>

<template>
    <div class="tp-page">
        <AccountSidebar />

        <section class="tp-content">
            <div class="tp-head">
                <div>
                    <h1 class="tp-title">Trading Points</h1>
                    <p class="tp-subtitle">Delivery addresses for your company. Add, edit or remove them anytime.</p>
                </div>
                <div class="tp-head-actions">
                    <button
                        v-if="hiddenPoints.length"
                        class="tp-btn tp-btn--ghost"
                        @click="showHidden = !showHidden"
                    >
                        {{ showHidden ? 'Hide removed' : `Removed (${hiddenPoints.length})` }}
                    </button>
                    <button class="tp-btn tp-btn--primary" @click="openAdd">+ Add point</button>
                </div>
            </div>

            <TradingPointAddForm
                v-if="addOpen"
                v-model="addForm"
                :saving="addSaving"
                @submit="submitAdd"
                @cancel="addOpen = false"
            />

            <div v-if="!loading && !visiblePoints.length && !addOpen" class="tp-empty">
                <span>📍</span>
                <div>No delivery addresses yet. Add your first trading point.</div>
            </div>

            <div class="tp-list">
                <TradingPointCard
                    v-for="pt in visiblePoints"
                    :key="pt.id"
                    :point="pt"
                    :is-current="pt.id === preferredId"
                    @save="handleSave"
                    @remove="handleRemove"
                    @set-current="handleSetCurrent"
                />
            </div>

            <TradingPointRemovedList
                v-if="showHidden && hiddenPoints.length"
                :points="hiddenPoints"
                @restore="handleRestore"
            />
        </section>
    </div>
</template>

<style scoped>
.tp-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.tp-content { min-width: 0; }

.tp-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
}

.tp-title {
    margin: 0 0 6px;
    font-size: clamp(34px, 3.6vw, 50px);
    line-height: 0.98;
    letter-spacing: -0.055em;
}

.tp-subtitle { color: #66736e; font-size: 14px; margin: 0; }
.tp-head-actions { display: flex; gap: 8px; flex-shrink: 0; }

.tp-btn {
    border: 0;
    border-radius: 12px;
    padding: 0 16px;
    min-height: 40px;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
    transition: 0.14s ease;
}
.tp-btn--primary { background: #00a878; color: #fff; }
.tp-btn--ghost { background: #f3f8f6; color: #263732; border: 1px solid #dde7e2; }
.tp-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.tp-empty {
    text-align: center;
    padding: 64px 24px;
    color: #66736e;
    font-size: 15px;
    display: grid;
    gap: 12px;
}

.tp-empty span { font-size: 40px; }

.tp-list { display: grid; gap: 12px; margin-bottom: 20px; }

@media (max-width: 960px) {
    .tp-page { grid-template-columns: 1fr; padding-left: 16px; padding-right: 16px; }
}

@media (max-width: 640px) {
    .tp-head { flex-direction: column; }
}
</style>
