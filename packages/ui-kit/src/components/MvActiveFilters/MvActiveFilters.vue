<script setup lang="ts">
import { IconX } from '@tabler/icons-vue';

export interface ActiveFilter {
    key: string;
    label: string;
}

withDefaults(defineProps<{ chips: ActiveFilter[]; clearLabel?: string; removeLabel?: string }>(), {
    clearLabel: 'Clear all',
    removeLabel: 'Remove filter',
});
const emit = defineEmits<{ remove: [key: string]; clear: [] }>();
</script>

<template>
    <div v-if="chips.length" class="mv-active-filters" role="group">
        <span v-for="chip in chips" :key="chip.key" class="mv-active-filters__chip" :title="chip.label">
            <span class="mv-active-filters__label">{{ chip.label }}</span>
            <button
                type="button"
                class="mv-active-filters__remove"
                :aria-label="`${removeLabel}: ${chip.label}`"
                @click="emit('remove', chip.key)"
            >
                <IconX :size="14" :stroke="2.2" />
            </button>
        </span>
        <button type="button" class="mv-active-filters__clear" @click="emit('clear')">
            <IconX :size="14" :stroke="2.2" />
            {{ clearLabel }}
        </button>
    </div>
</template>

<style scoped>
.mv-active-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

/* Same pill metrics and "active" palette as MvFilterChips. */
.mv-active-filters__chip,
.mv-active-filters__clear {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    max-width: 100%;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
}

.mv-active-filters__chip {
    padding: 0 4px 0 12px;
    border: 1px solid var(--el-color-primary-light-7, #c8f7ec);
    background: var(--el-color-primary-light-9, #f0fffa);
    color: var(--el-color-primary-dark-2, #008a70);
}

.mv-active-filters__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mv-active-filters__remove {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
}

.mv-active-filters__remove:hover { background: rgba(0, 113, 90, 0.15); }

.mv-active-filters__clear {
    padding: 0 12px 0 8px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    background: #fff;
    color: var(--el-text-color-regular, #374151);
    cursor: pointer;
}

.mv-active-filters__clear:hover { background: var(--el-fill-color-light, #f8fafc); }

.mv-active-filters__remove:focus-visible,
.mv-active-filters__clear:focus-visible {
    outline: 2px solid var(--el-color-primary, #00b894);
    outline-offset: 1px;
}
</style>
