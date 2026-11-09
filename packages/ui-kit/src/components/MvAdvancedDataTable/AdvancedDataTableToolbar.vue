<script setup lang="ts">
import { Setting } from '@element-plus/icons-vue';
import MvButton from '../MvButton/MvButton.vue';
import MvColumnToggle from '../MvColumnToggle/MvColumnToggle.vue';
import MvColumnFilterText from '../MvColumnFilter/MvColumnFilterText.vue';
import MvFilterBuilder from '../MvFilterBuilder/MvFilterBuilder.vue';
import type { FilterColumn, FilterCondition } from '../MvFilterBuilder/filterBuilderTypes';
import type { ColumnVisibilityDef } from '../../composables/useColumnVisibility';
import type { AdvancedDataTableSearchConfig } from './advancedDataTableTypes';

defineProps<{
    search?: AdvancedDataTableSearchConfig;
    searchValue: string;
    filterColumns: FilterColumn[];
    columnToggleItems: (ColumnVisibilityDef & { visible: boolean })[];
    isMobile: boolean;
}>();

const emit = defineEmits<{
    'search-change': [value: unknown];
    'column-toggle': [field: string];
    'columns-reorder': [order: string[]];
    'columns-reset': [];
}>();

const conditions = defineModel<FilterCondition[]>('conditions', { required: true });
</script>

<template>
    <div class="mv-advanced-data-table__toolbar">
        <div class="mv-advanced-data-table__toolbar-start">
            <MvColumnFilterText
                v-if="search"
                :config="{
                    type: 'text',
                    placeholder: search.placeholder,
                    debounceMs: search.debounceMs,
                }"
                :model-value="searchValue"
                @update:model-value="emit('search-change', $event)"
            />
            <MvFilterBuilder
                v-if="filterColumns.length"
                v-model="conditions"
                :columns="filterColumns"
            />
            <slot name="toolbar-start" />
        </div>
        <div class="mv-advanced-data-table__toolbar-end">
            <slot name="toolbar-end" />
            <!-- A card layout has no header row for column settings to describe. Desktop-only. -->
            <MvColumnToggle
                v-if="!isMobile"
                :columns="columnToggleItems"
                trigger-label=""
                searchable
                reorderable
                show-footer
                @toggle="emit('column-toggle', $event)"
                @reorder="emit('columns-reorder', $event)"
                @reset="emit('columns-reset')"
            >
                <template #icon>
                    <Setting class="mv-advanced-data-table__btn-icon" />
                </template>
            </MvColumnToggle>
        </div>
    </div>
</template>

<style scoped src="./AdvancedDataTableToolbar.css"></style>
