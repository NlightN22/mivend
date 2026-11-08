<script setup lang="ts">
import { computed } from 'vue';
import { IconAlertTriangleFilled, IconInfoCircleFilled } from '@tabler/icons-vue';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
import MvTooltip from '../MvTooltip/MvTooltip.vue';

export type FlagChipTone = 'danger' | 'orange' | 'warning' | 'info';

const props = defineProps<{ tone: FlagChipTone; label: string; tipDisabled?: boolean }>();
const slots = defineSlots<{ default?(): unknown; tip?(): unknown }>();
const isMobile = useIsMobileViewport(640);
// A phone has no hover: the tap opens the caller's popover instead.
const tipOff = computed(() => !slots.tip || !!props.tipDisabled || isMobile.value);
</script>

<template>
    <span class="mv-flag-chip">
        <slot />
        <MvTooltip trigger="hover" placement="top" :disabled="tipOff">
            <template #trigger>
                <button
                    type="button"
                    class="mv-flag-chip__icon"
                    :class="`mv-flag-chip__icon--${tone}`"
                    :aria-label="label"
                    :title="slots.tip ? undefined : label"
                >
                    <IconInfoCircleFilled v-if="tone === 'info'" :size="16" aria-hidden="true" />
                    <IconAlertTriangleFilled v-else :size="16" aria-hidden="true" />
                </button>
            </template>
            <slot name="tip" />
        </MvTooltip>
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

.mv-flag-chip__icon--info {
    color: var(--app-info-fg);
}

.mv-flag-chip__icon--warning {
    color: var(--app-warn-fg);
}
</style>
