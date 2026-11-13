<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    MvButton,
    MvStatusBadge,
    MvAdvancedDataTable,
    MvDateTimeCell,
    MvFilterChips,
    useDataTableState,
    useUrlSyncedState,
    type FilterChip,
} from '@mivend/ui-kit';
import TableViewsMenu from '../TableViewsMenu.vue';
import type { TableViewState } from '../../composables/tableViewState';
import { buildTeamColumns, ROLE_BADGE_VARIANT, type TeamRow } from './customerTeamColumns';

// A counterparty team is a bounded list (owner plus a few members), so search, role chips and
// paging run client-side over the full rows.
const props = defineProps<{
    rows: TeamRow[];
    loading: boolean;
    canManage: boolean;
    saving: boolean;
    administratorId: string;
}>();

const emit = defineEmits<{ remove: [administratorId: string] }>();
const { t, te } = useI18n();

const roleLabel = (role: string): string =>
    te(`customers.team.roles.${role}`) ? t(`customers.team.roles.${role}`) : role;

const columns = computed(() =>
    buildTeamColumns(f => t(`customers.team.columns.${f}`), t('customers.team.search')),
);
const baseColumns = columns.value;

const SORT = { field: 'createdAt', dir: 'ASC' } as const;
const { state: tableState } = useDataTableState<{ [key: string]: unknown; member: string }>(
    `customer-team-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: baseColumns.map(c => c.field),
        columnWidths: Object.fromEntries(baseColumns.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { member: '' },
        pageSize: 20,
    },
    { columns: baseColumns, allowedFilterKeys: [] },
);

const urlDefaults = { search: '', role: '' };
const { fromQuery, toQuery } = useUrlSyncedState(urlDefaults, 'team.');
const page = ref(1);
const url = { ...urlDefaults };
fromQuery(url, page);
const role = ref(url.role);
tableState.value.filters.member = url.search;
const route = useRoute();
const openedWithLink = !!(route.query['team.search'] || route.query['team.role']);

watch([() => tableState.value.filters.member, role], () => {
    page.value = 1;
});
watch([() => tableState.value.filters.member, role, page], () => {
    toQuery({ search: String(tableState.value.filters.member), role: role.value }, page);
});

const query = computed(() => String(tableState.value.filters.member).trim().toLowerCase());
const filteredRows = computed(() =>
    props.rows.filter(
        r =>
            (!query.value || r.member.toLowerCase().includes(query.value)) &&
            (!role.value || r.role === role.value),
    ),
);
const pagedRows = computed(() => {
    const start = (page.value - 1) * tableState.value.pageSize;
    return filteredRows.value.slice(start, start + tableState.value.pageSize);
});

const chips = computed<FilterChip[]>(() => [
    { key: 'all', label: t('customers.team.allRoles'), count: props.rows.length },
    ...Object.keys(ROLE_BADGE_VARIANT).map(r => ({
        key: r,
        label: roleLabel(r),
        variant: ROLE_BADGE_VARIANT[r],
        count: props.rows.filter(row => row.role === r).length,
    })),
]);

function captureView(): TableViewState {
    return {
        filters: {
            search: String(tableState.value.filters.member),
            view: role.value || 'all',
            conditions: [],
        },
        sort: { ...SORT },
        columnOrder: [...tableState.value.columnOrder],
        hiddenColumns: [...tableState.value.hiddenColumns],
    };
}
function applyView(state: TableViewState): void {
    tableState.value.filters.member = state.filters.search;
    role.value = state.filters.view === 'all' ? '' : state.filters.view;
    tableState.value.columnOrder = [...state.columnOrder];
    tableState.value.hiddenColumns = [...state.hiddenColumns];
}
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="columns"
        :rows="pagedRows"
        :loading="loading"
        :total-items="filteredRows.length"
        :page="page"
        data-key="id"
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="{ member: '' }"
        :search="{ filterKey: 'member', placeholder: t('customers.team.search') }"
        :empty-message="t('customers.team.empty')"
        @update:page="p => (page = p)"
        @reset-page="page = 1"
        @clear-filters="role = ''"
    >
        <template #toolbar-start>
            <MvFilterChips
                :chips="chips"
                :active="role || 'all'"
                @select="role = $event === 'all' ? '' : $event"
            />
        </template>
        <template #toolbar-end>
            <slot name="toolbar-end" />
            <TableViewsMenu
                views-key="customer-team"
                :owner-key="administratorId"
                :capture="captureView"
                :apply="applyView"
                :skip-restore="() => openedWithLink"
            />
        </template>

        <template #cell-createdAt="{ data }">
            <MvDateTimeCell
                v-if="(data as TeamRow).createdAt"
                :value="(data as TeamRow).createdAt as string"
            />
            <span v-else>—</span>
        </template>
        <template #cell-role="{ data }">
            <MvStatusBadge :variant="ROLE_BADGE_VARIANT[(data as TeamRow).role] ?? 'neutral'">{{
                roleLabel((data as TeamRow).role)
            }}</MvStatusBadge>
        </template>
        <template #cell-actions="{ data }">
            <MvButton
                v-if="!(data as TeamRow).isOwner && canManage && (data as TeamRow).administratorId"
                variant="danger"
                size="sm"
                :disabled="saving"
                @click="emit('remove', (data as TeamRow).administratorId as string)"
            >
                {{ t('customers.team.remove') }}
            </MvButton>
        </template>
    </MvAdvancedDataTable>
</template>
