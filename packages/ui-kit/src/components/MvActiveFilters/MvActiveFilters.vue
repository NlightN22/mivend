<script setup lang="ts">
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
        <span v-for="chip in chips" :key="chip.key" class="mv-active-filters__chip">
            {{ chip.label }}
            <button
                type="button"
                class="mv-active-filters__remove"
                :aria-label="`${removeLabel}: ${chip.label}`"
                @click="emit('remove', chip.key)"
            >×</button>
        </span>
        <button type="button" class="mv-active-filters__clear" @click="emit('clear')">{{ clearLabel }}</button>
    </div>
</template>

<style scoped>
.mv-active-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mv-active-filters__chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 4px 6px 4px 12px;
    border-radius: 999px;
    background: var(--el-fill-color-light, #f0f4f8);
    color: var(--el-text-color-primary, #17212b);
    font-size: 13px;
}

.mv-active-filters__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: #667085;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
}

.mv-active-filters__remove:hover { background: rgba(0, 0, 0, 0.08); color: #17212b; }

.mv-active-filters__clear {
    border: none;
    background: transparent;
    color: var(--el-color-primary, #00b894);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 6px;
}

.mv-active-filters__remove:focus-visible,
.mv-active-filters__clear:focus-visible {
    outline: 2px solid var(--el-color-primary, #00b894);
    outline-offset: 1px;
}
</style>
