<script setup lang="ts">
import type { TradingPoint } from './TradingPointCard.vue';

defineProps<{ points: TradingPoint[] }>();
const emit = defineEmits<{ restore: [id: string] }>();
</script>

<template>
    <div class="tp-section-label">Removed points</div>
    <div class="tp-list">
        <div v-for="pt in points" :key="pt.id" class="tp-removed-card">
            <div>
                <div class="tp-removed-name">{{ pt.name }}</div>
                <div class="tp-removed-addr">{{ pt.address }}</div>
            </div>
            <button class="tp-btn tp-btn--ghost tp-btn--sm" @click="emit('restore', pt.id)">Restore</button>
        </div>
    </div>
</template>

<style scoped>
.tp-section-label {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #a8b8b2;
    margin-bottom: 10px;
}

.tp-list { display: grid; gap: 12px; margin-bottom: 20px; }

.tp-removed-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 20px;
    background: #fff;
    border: 1px solid #dde7e2;
    border-radius: 16px;
    opacity: 0.7;
}

.tp-removed-name { font-size: 15px; font-weight: 800; color: #14231f; margin-bottom: 3px; }
.tp-removed-addr { font-size: 13px; color: #66736e; }

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
.tp-btn--ghost { background: #f3f8f6; color: #263732; border: 1px solid #dde7e2; }
.tp-btn--sm { min-height: 34px; padding: 0 12px; font-size: 13px; border-radius: 10px; }
</style>
