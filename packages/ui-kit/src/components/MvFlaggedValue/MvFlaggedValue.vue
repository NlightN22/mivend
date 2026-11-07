<script setup lang="ts">
import { IconAlertTriangle } from '@tabler/icons-vue';
import MvTooltip from '../MvTooltip/MvTooltip.vue';

export type FlagSeverity = 'warning' | 'danger';

defineProps<{ severity: FlagSeverity; tooltip: string }>();
</script>

<template>
    <MvTooltip trigger="hover" placement="top">
        <template #trigger>
            <span class="mv-flagged" :class="`mv-flagged--${severity}`" tabindex="0">
                <slot />
                <IconAlertTriangle :size="15" class="mv-flagged__icon" aria-hidden="true" />
            </span>
        </template>
        {{ tooltip }}
    </MvTooltip>
</template>

<style scoped>
.mv-flagged {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: var(--app-radius-sm, 8px);
    font-weight: 700;
    cursor: help;
}

.mv-flagged--danger {
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
}

.mv-flagged--warning {
    background: var(--app-warn-bg);
    color: var(--app-warn-fg);
}
</style>
