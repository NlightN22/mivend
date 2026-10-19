<script setup lang="ts">
import type { TradingPointAddForm } from './useTradingPoints';
import TradingPointFields from './TradingPointFields.vue';

const model = defineModel<TradingPointAddForm>({ required: true });

defineProps<{ saving: boolean }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();
</script>

<template>
    <div class="tp-add-card">
        <div class="tp-add-title">{{ $t('tradingPoints.newTitle') }}</div>
        <TradingPointFields v-model="model" />
        <div class="tp-add-actions">
            <button
                class="tp-btn tp-btn--primary"
                :disabled="saving || !model.name || !model.address"
                @click="emit('submit')"
            >
                {{ saving ? $t('tradingPoints.saving') : $t('tradingPoints.addPoint') }}
            </button>
            <button class="tp-btn tp-btn--ghost" @click="emit('cancel')">
                {{ $t('common.cancel') }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.tp-add-card {
    background: #fff;
    border: 1px solid #00a878;
    border-radius: 20px;
    padding: 18px 20px;
    margin-bottom: 16px;
}

.tp-add-title {
    font-size: 16px;
    font-weight: 900;
    letter-spacing: -0.03em;
    margin-bottom: 14px;
}

.tp-add-actions {
    display: flex;
    gap: 8px;
}

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
.tp-btn--primary {
    background: #00a878;
    color: #fff;
}
.tp-btn--ghost {
    background: #f3f8f6;
    color: #263732;
    border: 1px solid #dde7e2;
}
.tp-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>
