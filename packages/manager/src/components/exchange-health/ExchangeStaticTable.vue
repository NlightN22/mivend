<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';

type Row = { [key: string]: unknown };

// A fixed, small set (streams, event types, channels): one page, no filters; the page-level refresh reloads it.
const props = defineProps<{
    columns: AdvancedDataTableColumn[];
    rows: Row[];
    dataKey: string;
    storageKey: string;
    emptyMessage: string;
    loading?: boolean;
    rowHeightPx?: number;
}>();

const { state } = useDataTableState<{ [key: string]: unknown }>(
    props.storageKey,
    {
        columnOrder: props.columns.map(c => c.field),
        columnWidths: Object.fromEntries(props.columns.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: {},
        pageSize: 100,
    },
    { columns: props.columns, allowedFilterKeys: [], externallyOwned: { filterKeys: [] } },
);
const page = ref(1);
const total = computed(() => props.rows.length);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="state"
        :columns="columns"
        :rows="rows"
        :loading="loading ?? false"
        :total-items="total"
        :page="page"
        :data-key="dataKey"
        :row-height-px="rowHeightPx ?? 52"
        :header-height-px="65"
        :rows-per-page-options="[100]"
        :default-filters="{}"
        :empty-message="emptyMessage"
        @update:page="page = $event"
    >
        <template v-for="c in columns" :key="c.field" #[`cell-${c.field}`]="slotProps">
            <slot :name="`cell-${c.field}`" v-bind="slotProps">{{
                (slotProps.data as Row)[c.field] ?? '—'
            }}</slot>
        </template>
    </MvAdvancedDataTable>
</template>
