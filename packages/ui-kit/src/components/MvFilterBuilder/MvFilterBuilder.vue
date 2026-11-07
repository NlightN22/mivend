<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Filter } from '@element-plus/icons-vue';
import MvButton from '../MvButton/MvButton.vue';
import MvFilterEditor from './MvFilterEditor.vue';
import { useAnchoredPanel } from '../../composables/useAnchoredPanel';
import { useIsMobileViewport } from '../../composables/useIsMobileViewport';
import type { FilterColumn, FilterCondition } from './filterBuilderTypes';
import { describeCondition } from './filterDescribe';
import './MvFilterBuilder.css';

// One toolbar control for every table: pick a column, set operator and value, get removable chips.
// The owner holds the conditions (v-model) and turns them into a query.
const props = defineProps<{ columns: FilterColumn[] }>();
const conditions = defineModel<FilterCondition[]>({ required: true });
const emit = defineEmits<{ change: [] }>();

const open = ref(false);
const picked = ref<FilterColumn | null>(null);
const editIndex = ref<number | null>(null);
const anchorEl = ref<HTMLElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const buttonEl = ref<HTMLElement | null>(null);
const isMobile = useIsMobileViewport(640);
const { style: panelStyle, place } = useAnchoredPanel({
    open,
    anchor: () => anchorEl.value,
    width: 320,
    sheet: isMobile,
});

const chips = computed(() =>
    conditions.value.flatMap((condition, index) => {
        const column = props.columns.find(c => c.key === condition.columnKey);
        return column ? [{ index, column, label: describeCondition(condition, column) }] : [];
    }),
);

function openPicker(): void {
    if (open.value && editIndex.value === null) {
        open.value = false;
        return;
    }
    picked.value = null;
    editIndex.value = null;
    anchorEl.value = buttonEl.value;
    open.value = true;
}
function openEditor(index: number, column: FilterColumn, chip: HTMLElement): void {
    picked.value = column;
    editIndex.value = index;
    anchorEl.value = chip;
    open.value = true;
    place();
}
function commit(next: FilterCondition[]): void {
    conditions.value = next;
    emit('change');
}
function apply(condition: FilterCondition): void {
    const next = [...conditions.value];
    if (editIndex.value === null) next.push(condition);
    else next[editIndex.value] = condition;
    commit(next);
    open.value = false;
}
function remove(index: number): void {
    commit(conditions.value.filter((_, i) => i !== index));
}

function onDocClick(e: MouseEvent): void {
    // composedPath, not contains(): the clicked column button is already re-rendered away.
    const path = e.composedPath();
    if (path.includes(rootEl.value as EventTarget) || path.includes(panelEl.value as EventTarget))
        return;
    open.value = false;
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
</script>

<template>
    <div ref="rootEl" class="mv-filter-builder" data-testid="filter-builder">
        <span ref="buttonEl" class="mv-filter-builder__anchor">
            <MvButton
                size="sm"
                variant="ghost"
                data-testid="filter-trigger"
                :aria-expanded="open"
                @click="openPicker"
            >
                <Filter class="mv-filter-builder__icon" />
                <span class="mv-filter-builder__label">Filter</span>
            </MvButton>
        </span>
        <span
            v-for="chip in chips"
            :key="`${chip.index}-${chip.label}`"
            class="mv-filter-builder__chip"
            data-testid="filter-chip"
        >
            <button
                type="button"
                class="mv-filter-builder__chip-edit"
                :title="chip.label"
                @click="openEditor(chip.index, chip.column, $event.currentTarget as HTMLElement)"
            >
                {{ chip.label }}
            </button>
            <button
                type="button"
                class="mv-filter-builder__chip-remove"
                :aria-label="`Remove ${chip.label} filter`"
                @click="remove(chip.index)"
            >
                ×
            </button>
        </span>
        <button
            v-if="chips.length > 1"
            type="button"
            class="mv-filter-builder__clear"
            data-testid="filter-clear"
            @click="commit([])"
        >
            Clear filters
        </button>
        <Teleport to="body">
            <div
                v-if="open && isMobile"
                class="mv-filter-builder__backdrop"
                @click="open = false"
            />
            <div
                v-if="open"
                ref="panelEl"
                class="mv-filter-builder__panel"
                :class="{ 'mv-filter-builder__panel--sheet': isMobile }"
                :style="panelStyle"
                role="dialog"
                data-testid="filter-panel"
            >
                <MvFilterEditor
                    v-if="picked"
                    :key="`${picked.key}-${editIndex}`"
                    :column="picked"
                    :initial="editIndex === null ? undefined : conditions[editIndex]"
                    @apply="apply"
                    @back="picked = null"
                />
                <template v-else>
                    <div class="mv-filter-builder__title">Filter by</div>
                    <button
                        v-for="column in columns"
                        :key="column.key"
                        type="button"
                        class="mv-filter-builder__column"
                        :data-testid="`filter-column-${column.key}`"
                        @click="picked = column"
                    >
                        {{ column.label }}
                    </button>
                    <div v-if="!columns.length" class="mv-filter-builder__empty">
                        Nothing to filter by
                    </div>
                </template>
            </div>
        </Teleport>
    </div>
</template>
