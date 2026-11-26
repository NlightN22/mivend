<script setup lang="ts">
import { computed, ref } from 'vue';
import {
    MvAdvancedDataTable,
    useDataTableState,
    useIsMobileViewport,
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
        pageSize: 20,
    },
    { columns: props.columns, allowedFilterKeys: [], externallyOwned: { filterKeys: [] } },
);
const page = ref(1);
const total = computed(() => props.rows.length);
const isMobile = useIsMobileViewport(800);
// The phone card list shows exactly the rows it is given, so the page is cut here; the desktop grid pages itself.
const shownRows = computed(() =>
    isMobile.value
        ? props.rows.slice(
              (page.value - 1) * state.value.pageSize,
              page.value * state.value.pageSize,
          )
        : props.rows,
);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="state"
        :columns="columns"
        :rows="shownRows"
        :loading="loading ?? false"
        :total-items="total"
        :page="page"
        :data-key="dataKey"
        :row-height-px="rowHeightPx ?? 52"
        :header-height-px="65"
        :rows-per-page-options="[20, 50, 100]"
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
