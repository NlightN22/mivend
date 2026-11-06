<script setup lang="ts">
import type { TradingPointAddForm } from './useTradingPoints';
import { isTradingPointValid } from './tradingPointValidation';
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
                :disabled="saving || !isTradingPointValid(model)"
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
    background: var(--app-surface);
    border: 1px solid var(--el-color-primary);
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
    background: var(--app-brand-fill);
    color: var(--app-on-accent);
}
.tp-btn--ghost {
    background: var(--app-fill-soft);
    color: var(--app-text-deep);
    border: 1px solid var(--app-nav-border-strong);
}
.tp-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
</style>
