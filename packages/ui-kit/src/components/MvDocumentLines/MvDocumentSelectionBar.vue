<script setup lang="ts">
import { useUiLabels } from '../../utils/uiLabels';
import MvCheckbox from '../MvCheckbox/MvCheckbox.vue';
const uiLabel = useUiLabels();

defineProps<{ count: number; total: number }>();
defineEmits<{ 'select-all': [on: boolean] }>();
</script>

<template>
    <div class="doc-selbar" data-testid="doc-selection-bar">
        <MvCheckbox
            :model-value="count === total"
            :indeterminate="count < total"
            :aria-label="uiLabel('selectAllPositions', 'Select all positions')"
            @update:model-value="$emit('select-all', $event)"
        />
        <span class="doc-selbar__count" data-testid="doc-selected-count">{{
            uiLabel('selectedCount', 'Selected: {count}').replace('{count}', () => String(count))
        }}</span>
        <div class="doc-selbar__end"><slot /></div>
    </div>
</template>

<style scoped>
.doc-selbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: var(--app-stock-in-bg);
    border: 1px solid var(--app-primary-btn);
    border-radius: var(--app-radius-sm, 8px) var(--app-radius-sm, 8px) 0 0;
    font-size: 14px;
    font-weight: 600;
}

.doc-selbar__end {
    margin-left: auto;
}

@media (max-width: 800px) {
    .doc-selbar {
        display: none;
    }
}
</style>
