<script setup lang="ts">
export interface OperationalMetric {
    label: string;
    value: string;
}

defineProps<{ metrics: OperationalMetric[] }>();
</script>

<template>
    <div class="operational-panel">
        <div v-for="metric in metrics" :key="metric.label" class="operational-panel__row">
            <span class="operational-panel__label">{{ metric.label }}</span>
            <span class="operational-panel__value">{{ metric.value }}</span>
        </div>
    </div>
</template>

<style scoped>
.operational-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.operational-panel__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
}

.operational-panel__label {
    color: var(--el-text-color-secondary, #6b7280);
}

.operational-panel__value {
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}
</style>
