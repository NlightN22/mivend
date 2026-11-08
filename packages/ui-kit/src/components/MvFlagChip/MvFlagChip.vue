<script setup lang="ts">
import { IconAlertTriangle } from '@tabler/icons-vue';

export type FlagChipTone = 'danger' | 'orange' | 'warning';

defineProps<{ tone: FlagChipTone; label: string }>();
</script>

<template>
    <button type="button" class="mv-flag-chip" :class="`mv-flag-chip--${tone}`" :aria-label="label">
        <slot />
        <IconAlertTriangle :size="15" aria-hidden="true" />
    </button>
</template>

<style scoped>
.mv-flag-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border: 0;
    border-radius: var(--app-radius-sm, 8px);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
}

.mv-flag-chip--danger {
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
}

.mv-flag-chip--orange {
    background: var(--app-stock-low-bg);
    color: var(--app-stock-low-fg);
}

.mv-flag-chip--warning {
    background: var(--app-warn-bg);
    color: var(--app-warn-fg);
}
</style>
