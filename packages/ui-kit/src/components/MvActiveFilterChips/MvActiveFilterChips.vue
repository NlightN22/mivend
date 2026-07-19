<script setup lang="ts">
// A generic "Active filters: [chip ×] [chip ×] … Clear filters" row — the table supplies already-
// described chips (label + key), this component only renders and forwards remove/clear-all
// intent. Kept separate from the per-column filter popovers themselves so it can sit anywhere in
// a table's toolbar without depending on the registry/config types those use.
export interface ActiveFilterChip {
    key: string;
    label: string;
}

defineProps<{ chips: ActiveFilterChip[] }>();
const emit = defineEmits<{ remove: [key: string]; 'clear-all': [] }>();
</script>

<template>
    <div v-if="chips.length" class="mv-active-filter-chips">
        <span class="mv-active-filter-chips__label">Active filters:</span>
        <span v-for="chip in chips" :key="chip.key" class="mv-active-filter-chips__chip">
            {{ chip.label }}
            <button type="button" :aria-label="`Remove ${chip.label} filter`" @click="emit('remove', chip.key)">×</button>
        </span>
        <button type="button" class="mv-active-filter-chips__clear-all" @click="emit('clear-all')">Clear filters</button>
    </div>
</template>

<style scoped>
.mv-active-filter-chips {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
    font-size: 13px;
}

.mv-active-filter-chips__label {
    color: var(--el-text-color-secondary, #6b7280);
    font-weight: 600;
}

.mv-active-filter-chips__chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--el-fill-color-light, #f0f4f8);
    color: var(--el-text-color-primary, #17212b);
    font-size: 12px;
}

.mv-active-filter-chips__chip button {
    border: none;
    background: transparent;
    color: #98a2b3;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
}

.mv-active-filter-chips__clear-all {
    border: none;
    background: transparent;
    color: var(--el-color-primary, #00b894);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
}
</style>
