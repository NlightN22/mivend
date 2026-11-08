<script setup lang="ts">
import { IconAlertTriangleFilled } from '@tabler/icons-vue';

export type FlagChipTone = 'danger' | 'orange' | 'warning';

defineProps<{ tone: FlagChipTone; label: string }>();
</script>

<template>
    <span class="mv-flag-chip">
        <slot />
        <button
            type="button"
            class="mv-flag-chip__icon"
            :class="`mv-flag-chip__icon--${tone}`"
            :aria-label="label"
            :title="label"
        >
            <IconAlertTriangleFilled :size="16" aria-hidden="true" />
        </button>
    </span>
</template>

<style scoped>
.mv-flag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
}

.mv-flag-chip__icon {
    display: inline-flex;
    padding: 2px;
    border: 0;
    border-radius: var(--app-radius-sm, 8px);
    background: transparent;
    cursor: pointer;
}

.mv-flag-chip__icon:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
}

.mv-flag-chip__icon--danger {
    color: var(--app-danger-fg);
}

.mv-flag-chip__icon--orange {
    color: var(--app-stock-low-fg);
}

.mv-flag-chip__icon--warning {
    color: var(--app-warn-fg);
}
</style>
