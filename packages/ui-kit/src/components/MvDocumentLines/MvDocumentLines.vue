<script setup lang="ts" generic="R extends DocRow">
import MvCheckbox from '../MvCheckbox/MvCheckbox.vue';
import MvSkeleton from '../MvSkeleton/MvSkeleton.vue';
import type { useLineSelection } from '../../composables/useLineSelection';
import MvDocumentLineRow from './MvDocumentLineRow.vue';
import MvDocumentLinesToolbar from './MvDocumentLinesToolbar.vue';
import { visibleColumns, type DocColumn, type DocRow } from './documentLinesModel';

const props = defineProps<{
    title: string;
    columns: DocColumn[];
    rows: R[];
    loading?: boolean;
    selection?: ReturnType<typeof useLineSelection>;
    editingId?: string | null;
    savingId?: string | null;
    busy?: boolean;
    canEdit?: (row: R) => boolean;
    canRemove?: (row: R) => boolean;
    errors?: Record<string, string>;
}>();
defineEmits<{
    start: [id: string];
    commit: [id: string];
    cancel: [id: string];
    remove: [id: string];
    'flag-action': [id: string, column: string, action: string];
}>();

const selecting = () => !!props.selection?.active.value;
</script>

<template>
    <div class="mv-doc-lines">
        <MvDocumentLinesToolbar
            :title="title"
            :count="rows.length"
            :selectable="!!selection"
            :selecting="selecting()"
            :selected-count="selection?.count.value ?? 0"
            @select="selection!.active.value = true"
            @cancel="selection!.clear()"
        >
            <template #toolbar><slot name="toolbar" /></template>
            <template #bulk="{ count }"><slot name="bulk" :count="count" /></template>
        </MvDocumentLinesToolbar>
        <slot name="notices" />
        <div class="mv-doc-lines__scroll">
            <table class="mv-doc-lines__table">
                <thead>
                    <tr>
                        <th v-if="selecting()" class="mv-doc-lines__select">
                            <MvCheckbox
                                :model-value="selection!.allSelected.value"
                                :indeterminate="
                                    selection!.count.value > 0 && !selection!.allSelected.value
                                "
                                aria-label="Select all positions"
                                @update:model-value="selection!.setAll"
                            />
                        </th>
                        <th v-for="col in visibleColumns(columns)" :key="col.key">
                            {{ col.label }}
                        </th>
                        <th class="mv-doc-lines__actions" />
                    </tr>
                </thead>
                <tbody v-if="loading">
                    <tr v-for="n in 3" :key="n" class="mv-doc-lines__skeleton">
                        <td :colspan="visibleColumns(columns).length + 2">
                            <MvSkeleton height="36px" />
                        </td>
                    </tr>
                </tbody>
                <tbody v-else>
                    <MvDocumentLineRow
                        v-for="row in rows"
                        :key="row.id"
                        :row="row"
                        :columns="columns"
                        :selectable="selecting()"
                        :selected="selection?.selected.value.has(row.id) ?? false"
                        :editing="editingId === row.id"
                        :saving="savingId === row.id"
                        :busy="busy ?? false"
                        :can-edit="canEdit?.(row) ?? false"
                        :can-remove="canRemove?.(row) ?? false"
                        :error="errors?.[row.id]"
                        @toggle="selection!.toggle(row.id)"
                        @start="$emit('start', row.id)"
                        @commit="$emit('commit', row.id)"
                        @cancel="$emit('cancel', row.id)"
                        @remove="$emit('remove', row.id)"
                        @flag-action="(col, a) => $emit('flag-action', row.id, col, a)"
                    >
                        <template v-for="(_, name) in $slots" :key="name" #[name]="slotProps">
                            <slot :name="name" v-bind="slotProps ?? {}" />
                        </template>
                    </MvDocumentLineRow>
                </tbody>
            </table>
        </div>
        <slot name="totals" />
    </div>
</template>

<style scoped>
.mv-doc-lines__scroll {
    overflow-x: auto;
}

.mv-doc-lines__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.mv-doc-lines__table th {
    padding: 12px;
    text-align: left;
    font-size: 14px;
    font-weight: 500;
    color: var(--app-text-body2);
    background: var(--app-surface);
    border-bottom: 1px solid var(--el-border-color);
    white-space: nowrap;
}

.mv-doc-lines__select,
.mv-doc-lines__actions {
    width: 1%;
}

.mv-doc-lines__skeleton td {
    padding: 8px 12px;
}

@media (max-width: 800px) {
    .mv-doc-lines__table thead {
        display: none;
    }

    .mv-doc-lines__table,
    .mv-doc-lines__table :deep(tbody) {
        display: block;
    }
}
</style>
