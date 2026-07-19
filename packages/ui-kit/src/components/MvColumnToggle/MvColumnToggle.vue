<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Lock, Rank, Search } from '@element-plus/icons-vue';
import MvCheckbox from '../MvCheckbox/MvCheckbox.vue';
import MvButton from '../MvButton/MvButton.vue';
import type { ColumnVisibilityDef } from '../../composables/useColumnVisibility';

const props = withDefaults(
    defineProps<{
        columns: (ColumnVisibilityDef & { visible: boolean })[];
        // Opt-in extras for tables with many columns (see CustomerOrdersDataTable.vue) — the
        // plain checkbox list (searchable/reorderable/showFooter all false) stays the default so
        // existing simple call sites (e.g. CustomerOrdersTab.vue's mobile toggle) are unaffected.
        searchable?: boolean;
        reorderable?: boolean;
        showFooter?: boolean;
        triggerLabel?: string;
    }>(),
    { searchable: false, reorderable: false, showFooter: false, triggerLabel: 'Columns' },
);
const emit = defineEmits<{
    toggle: [key: string];
    // Full new order of every column key (required ones included, always first) — simplest
    // contract for the parent to just replace its own columnOrder wholesale, same shape
    // useDataTableState already persists.
    reorder: [order: string[]];
    reset: [];
}>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const search = ref('');

function onDocClick(e: MouseEvent): void {
    if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}
function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') open.value = false;
}

onMounted(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEscape);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onEscape);
});

// Required (pinned) columns always sort first and are never draggable/hideable — matches the
// reference design's pin icon rows staying at the top of the list regardless of search/reorder.
const orderedColumns = computed(() => [
    ...props.columns.filter(c => c.required),
    ...props.columns.filter(c => !c.required),
]);
const filteredColumns = computed(() => {
    const term = search.value.trim().toLowerCase();
    if (!term) return orderedColumns.value;
    return orderedColumns.value.filter(c => c.label.toLowerCase().includes(term));
});

let dragKey: string | null = null;
function onDragStart(key: string): void {
    dragKey = key;
}
function onDrop(targetKey: string): void {
    if (!dragKey || dragKey === targetKey) return;
    const keys = orderedColumns.value.map(c => c.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    dragKey = null;
    emit('reorder', keys);
}

function onApply(): void {
    open.value = false;
}

// Clicking anywhere in the row toggles it (not just the checkbox itself) — matches the original
// single-<label> row's native behavior before the row became a plain <div> (needed so drag
// events don't fight label semantics). MvCheckbox's own click is stopped from bubbling here
// (see its `@click.stop` in the template) so a click on the checkbox doesn't double-toggle.
function onRowClick(col: ColumnVisibilityDef & { visible: boolean }): void {
    if (col.required) return;
    emit('toggle', col.key);
}
</script>

<template>
    <div ref="rootEl" class="mv-column-toggle">
        <MvButton size="sm" variant="ghost" :class="{ 'mv-column-toggle__trigger--icon-only': !triggerLabel }" @click="open = !open">
            <slot name="icon" />
            <template v-if="triggerLabel">{{ triggerLabel }}</template>
        </MvButton>
        <div v-if="open" class="mv-column-toggle__panel">
            <div class="mv-column-toggle__header">
                <span class="mv-column-toggle__title">Columns</span>
                <span class="mv-column-toggle__subtitle">Choose visible columns</span>
            </div>

            <div v-if="searchable" class="mv-column-toggle__search">
                <Search class="mv-column-toggle__search-icon" />
                <input v-model="search" type="text" placeholder="Search columns…" />
            </div>

            <div class="mv-column-toggle__list">
                <div
                    v-for="col in filteredColumns"
                    :key="col.key"
                    class="mv-column-toggle__row"
                    :draggable="reorderable && !col.required"
                    @dragstart="onDragStart(col.key)"
                    @dragover.prevent
                    @drop="onDrop(col.key)"
                    @click="onRowClick(col)"
                >
                    <Rank v-if="reorderable" class="mv-column-toggle__handle" :class="{ 'mv-column-toggle__handle--disabled': col.required }" />
                    <MvCheckbox
                        v-if="!col.required"
                        :model-value="col.visible"
                        @click.stop
                        @update:model-value="emit('toggle', col.key)"
                    />
                    <Lock v-else class="mv-column-toggle__pin" />
                    <span>{{ col.label }}</span>
                </div>
                <div v-if="filteredColumns.length === 0" class="mv-column-toggle__empty">No matching columns</div>
            </div>

            <div v-if="showFooter" class="mv-column-toggle__footer">
                <MvButton size="sm" variant="ghost" @click="emit('reset')">Reset</MvButton>
                <MvButton size="sm" variant="primary" @click="onApply">Apply</MvButton>
            </div>
        </div>
    </div>
</template>

<style scoped>
.mv-column-toggle {
    position: relative;
    display: inline-block;
}

.mv-column-toggle :deep(.mv-column-toggle__trigger--icon-only) {
    width: 34px;
    padding: 0;
    justify-content: center;
}

.mv-column-toggle__panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    width: 260px;
    padding: 12px;
    background: white;
    border: 1px solid #e4e7ec;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(20, 42, 65, 0.12);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mv-column-toggle__header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 2px 4px;
}

.mv-column-toggle__title {
    font-size: 13px;
    font-weight: 600;
    color: #101828;
}

.mv-column-toggle__subtitle {
    font-size: 12px;
    color: #667085;
}

.mv-column-toggle__search {
    position: relative;
    display: flex;
    align-items: center;
}

.mv-column-toggle__search-icon {
    position: absolute;
    left: 8px;
    width: 14px;
    height: 14px;
    color: #98a2b3;
    pointer-events: none;
}

.mv-column-toggle__search input {
    width: 100%;
    padding: 6px 8px 6px 28px;
    border: 1px solid #e4e7ec;
    border-radius: 6px;
    font-size: 13px;
}

.mv-column-toggle__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 260px;
    overflow-y: auto;
}

.mv-column-toggle__row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
}

.mv-column-toggle__row:hover {
    background: #f8fafc;
}

.mv-column-toggle__handle {
    width: 14px;
    height: 14px;
    color: #98a2b3;
    cursor: grab;
    flex-shrink: 0;
}

.mv-column-toggle__handle--disabled {
    visibility: hidden;
}

.mv-column-toggle__pin {
    width: 14px;
    height: 14px;
    color: #98a2b3;
    flex-shrink: 0;
}

.mv-column-toggle__empty {
    padding: 8px 6px;
    font-size: 12px;
    color: #98a2b3;
    text-align: center;
}

.mv-column-toggle__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 6px;
    border-top: 1px solid #e4e7ec;
}
</style>
