<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvButton,
    MvFilterChips,
    MvStatusBadge,
    useDataTableState,
    useLatestRequest,
    useUrlSyncedState,
    type FilterChip,
} from '@mivend/ui-kit';
import ContractFilesModal from './ContractFilesModal.vue';
import TableViewsMenu from '../TableViewsMenu.vue';
import { buildContractColumns } from './customerContractsColumns';
import type { TableViewState } from '../../composables/tableViewState';
import { useAuthStore } from '../../stores/auth';
import {
    countContractsWithoutScan,
    fetchCounterpartyContracts,
    type ContractRow,
} from '../../api/contractFiles';

const props = defineProps<{ counterpartyId: string }>();
const { t } = useI18n();
const authStore = useAuthStore();
const canManage = authStore.hasPermission('ManageContractFiles');

const columns = computed(() =>
    buildContractColumns(f => t(`customers.contracts.columns.${f}`), t('customers.contracts.search')),
);
const baseColumns = columns.value;
const { state: tableState } = useDataTableState<{ [key: string]: unknown; name: string }>(
    `customer-contracts-datatable:${authStore.administrator?.id ?? 'anonymous'}`,
    {
        columnOrder: baseColumns.map(c => c.field),
        columnWidths: Object.fromEntries(baseColumns.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { name: '' },
        pageSize: 20,
    },
    { columns: baseColumns, allowedFilterKeys: [] },
);

const urlDefaults = { search: '', view: '' };
const { fromQuery, toQuery } = useUrlSyncedState(urlDefaults, 'contracts.');
const page = ref(1);
const url = { ...urlDefaults };
fromQuery(url, page);
const view = ref(url.view);
tableState.value.filters.name = url.search;

const rows = ref<ContractRow[]>([]);
const totalItems = ref(0);
const withoutScanCount = ref<number | null>(null);
const selected = ref<ContractRow | null>(null);

const { loading, run: load } = useLatestRequest(
    () =>
        fetchCounterpartyContracts(props.counterpartyId, {
            search: String(tableState.value.filters.name).trim(),
            withoutScan: view.value === 'withoutScan',
            page: page.value,
            pageSize: tableState.value.pageSize,
        }),
    result => {
        rows.value = result.items;
        totalItems.value = result.totalItems;
        if (selected.value) {
            selected.value = result.items.find(r => r.id === selected.value?.id) ?? null;
        }
    },
);

async function loadCount(): Promise<void> {
    withoutScanCount.value = await countContractsWithoutScan(props.counterpartyId);
}

function refresh(): void {
    void load();
    void loadCount();
}

watch([() => tableState.value.filters.name, view, () => tableState.value.pageSize], () => {
    page.value = 1;
});
watch(
    [() => tableState.value.filters.name, view, page, () => tableState.value.pageSize],
    () => {
        toQuery({ search: String(tableState.value.filters.name), view: view.value }, page);
        void load();
    },
);
onMounted(refresh);

const chips = computed<FilterChip[]>(() => [
    { key: 'all', label: t('customers.contracts.chips.all') },
    {
        key: 'withoutScan',
        label: t('customers.contracts.chips.withoutScan'),
        variant: 'warning',
        count: withoutScanCount.value ?? undefined,
        countLoading: withoutScanCount.value === null,
        emphasis: true,
    },
]);

function scanOf(row: ContractRow): ContractRow['files'][number] | undefined {
    return row.files.find(f => f.kind === 'scan');
}

function captureView(): TableViewState {
    return {
        filters: {
            search: String(tableState.value.filters.name),
            view: view.value || 'all',
            conditions: [],
        },
        sort: { field: 'name', dir: 'ASC' },
        columnOrder: [...tableState.value.columnOrder],
        hiddenColumns: [...tableState.value.hiddenColumns],
    };
}
function applyView(state: TableViewState): void {
    tableState.value.filters.name = state.filters.search;
    view.value = state.filters.view === 'all' ? '' : state.filters.view;
    tableState.value.columnOrder = [...state.columnOrder];
    tableState.value.hiddenColumns = [...state.hiddenColumns];
}
</script>

<template>
    <div>
        <MvAdvancedDataTable
            v-model:table-state="tableState"
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :total-items="totalItems"
            :page="page"
            data-key="id"
            :row-height-px="49"
            :header-height-px="65"
            :default-filters="{ name: '' }"
            :search="{ filterKey: 'name', placeholder: t('customers.contracts.search') }"
            :empty-message="t('customers.contracts.empty')"
            @update:page="p => (page = p)"
            @reset-page="page = 1"
            @clear-filters="view = ''"
        >
            <template #toolbar-start>
                <MvFilterChips
                    :chips="chips"
                    :active="view || 'all'"
                    @select="view = $event === 'all' ? '' : $event"
                />
            </template>
            <template #toolbar-end>
                <TableViewsMenu
                    views-key="customer-contracts"
                    :owner-key="authStore.administrator?.id ?? 'anonymous'"
                    :capture="captureView"
                    :apply="applyView"
                />
            </template>

            <template #cell-name="{ data }">
                {{ (data as ContractRow).name ?? (data as ContractRow).erpId }}
            </template>
            <template #cell-status="{ data }">
                <MvStatusBadge :variant="(data as ContractRow).isActive ? 'success' : 'neutral'">
                    {{
                        t(
                            (data as ContractRow).isActive
                                ? 'customers.contracts.active'
                                : 'customers.contracts.inactive',
                        )
                    }}
                </MvStatusBadge>
            </template>
            <template #cell-scan="{ data }">
                <a
                    v-if="scanOf(data as ContractRow)"
                    :href="scanOf(data as ContractRow)?.downloadUrl"
                    >{{ scanOf(data as ContractRow)?.fileName }}</a
                >
                <MvStatusBadge v-else-if="(data as ContractRow).isActive" variant="warning">
                    {{ t('customers.contracts.noScan') }}
                </MvStatusBadge>
                <span v-else>—</span>
            </template>
            <template #cell-files="{ data }">{{ (data as ContractRow).files.length }}</template>
            <template #cell-actions="{ data }">
                <MvButton size="sm" variant="secondary" @click="selected = data as ContractRow">
                    {{ t(canManage ? 'customers.contracts.manage' : 'customers.contracts.open') }}
                </MvButton>
            </template>
        </MvAdvancedDataTable>

        <ContractFilesModal
            v-if="selected"
            :contract="selected"
            :can-manage="canManage"
            @close="selected = null"
            @changed="refresh"
        />
    </div>
</template>
