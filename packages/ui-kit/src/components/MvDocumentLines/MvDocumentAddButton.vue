<script setup lang="ts">
import { IconPlus } from '@tabler/icons-vue';

defineProps<{ label: string; disabled?: boolean }>();
defineEmits<{ click: [] }>();
</script>

<template>
    <button
        type="button"
        class="doc-add-btn"
        data-testid="doc-add-button"
        :disabled="disabled"
        @click="$emit('click')"
    >
        <IconPlus :size="16" /> {{ label }}
    </button>
</template>

<style scoped>
.doc-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 10px;
    padding: 10px;
    border: 1px dashed var(--app-nav-border-strong);
    border-radius: var(--app-radius-sm, 8px);
    background: none;
    color: var(--app-text-body2);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
}

.doc-add-btn:hover:not(:disabled) {
    border-color: var(--app-primary-btn);
    background: var(--app-row-hover);
}

.doc-add-btn:disabled {
    opacity: 0.5;
    cursor: default;
}
</style>
