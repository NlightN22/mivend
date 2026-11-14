<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    MvAdvancedDataTable,
    MvButton,
    MvStatusBadge,
    useDataTableState,
    type AdvancedDataTableColumn,
    type StatusBadgeVariant,
} from '@mivend/ui-kit';
import {
    TEAM_STATUS_BADGE_VARIANT,
    type BranchOption,
    type DepartmentOption,
    type TeamDirectoryMember,
    type TeamFilters,
    type TeamMemberStatus,
} from '../../api/team';

const { t } = useI18n();

// Server-side paginated + filtered (manager-table-standard). No sortField: the directory has one
// stable order and a name sort would leak the order of masked names. Position has no
// server filter, hence no filter UI.
const props = defineProps<{
    members: TeamDirectoryMember[];
    departments: DepartmentOption[];
    branches: BranchOption[];
    roleOptions: { value: string; label: string }[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    filters: TeamFilters;
    administratorId: string;
    canManageUsers: boolean;
}>();

const emit = defineEmits<{
    'update:filters': [filters: TeamFilters];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'manage-users': [];
}>();

const STATUS_KEYS: TeamMemberStatus[] = ['active', 'inactive', 'unassigned'];

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'name',
        header: t('team.columns.name'),
        width: 200,
        required: true,
        filterConfig: { type: 'text', placeholder: t('team.filters.name') },
        mobile: { primary: true },
    },
    {
        field: 'department',
        header: t('team.columns.department'),
        width: 200,
        filterConfig: {
            type: 'select',
            placeholder: t('team.filters.allDepartments'),
            options: props.departments.map(d => ({ value: d.erpId, label: d.name })),
        },
    },
    {
        field: 'position',
        header: t('team.columns.position'),
        width: 180,
        filterConfig: { type: 'none' },
    },
    {
        field: 'branch',
        header: t('team.columns.branch'),
        width: 160,
        filterConfig: {
            type: 'select',
            placeholder: t('team.filters.allBranches'),
            options: props.branches.map(b => ({ value: b.id, label: b.name })),
        },
    },
    {
        field: 'roles',
        header: t('team.columns.roles'),
        width: 200,
        filterConfig: props.roleOptions.length
            ? {
                  type: 'select',
                  placeholder: t('team.filters.allRoles'),
                  options: props.roleOptions,
              }
            : { type: 'none' },
    },
    {
        field: 'erpId',
        header: t('team.columns.erpId'),
        width: 140,
        filterConfig: { type: 'none' },
    },
    {
        field: 'status',
        header: t('team.columns.status'),
        width: 130,
        filterConfig: {
            type: 'status',
            placeholder: t('team.filters.allStatuses'),
            options: STATUS_KEYS.map(value => ({
                value,
                label: t(`team.status.${value}`),
                variant: TEAM_STATUS_BADGE_VARIANT[value],
            })),
        },
        mobile: { badge: true },
    },
]);

interface TeamFilterState {
    [key: string]: unknown;
    name: string;
    department: string;
    branch: string;
    roles: string;
    status: string;
}
const BLANK_FILTERS: TeamFilterState = {
    name: '',
    department: '',
    branch: '',
    roles: '',
    status: '',
};
const FILTER_KEYS = ['name', 'department', 'branch', 'roles', 'status'];

function fromProps(filters: TeamFilters): TeamFilterState {
    return {
        name: filters.search,
        department: filters.departmentId,
        branch: filters.branchId,
        roles: filters.roleCode,
        status: filters.status === 'all' ? '' : filters.status,
    };
}

const { state: tableState } = useDataTableState<TeamFilterState>(
    `team-directory-datatable:${props.administratorId || 'anonymous'}`,
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: fromProps(props.filters),
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS.value,
        allowedFilterKeys: FILTER_KEYS,
        externallyOwned: { pageSize: true, filterKeys: FILTER_KEYS },
    },
);

function filtersChanged(next: TeamFilters): boolean {
    return (Object.keys(next) as (keyof TeamFilters)[]).some(k => next[k] !== props.filters[k]);
}

watch(
    () => tableState.value.filters,
    f => {
        const next: TeamFilters = {
            search: f.name,
            departmentId: f.department,
            branchId: f.branch,
            roleCode: f.roles,
            status: f.status || 'all',
        };
        if (filtersChanged(next)) {
            emit('update:filters', next);
        }
    },
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);
watch(
    () => props.filters,
    f => {
        tableState.value.filters = fromProps(f);
    },
    { deep: true },
);
watch(
    () => props.pageSize,
    v => {
        tableState.value.pageSize = v;
    },
);

function branchName(branchId: string | null): string {
    if (!branchId) return '—';
    return props.branches.find(b => b.id === branchId)?.name ?? '—';
}

function memberStatus(m: TeamDirectoryMember): TeamMemberStatus {
    if (!m.active) return 'inactive';
    return m.departmentId ? 'active' : 'unassigned';
}

interface TeamRow {
    [key: string]: unknown;
    id: string;
    name: string;
    department: string;
    position: string;
    branch: string;
    roles: string[];
    erpId: string;
    status: TeamMemberStatus;
    statusVariant: StatusBadgeVariant;
}
const rows = computed<TeamRow[]>(() =>
    props.members.map(m => {
        const status = memberStatus(m);
        return {
            id: m.id,
            name: m.firstName && m.lastName ? `${m.firstName} ${m.lastName}` : '—',
            department: m.departmentName ?? m.departmentId ?? '—',
            position: m.position ?? '—',
            branch: branchName(m.branchId),
            roles: m.roleCodes,
            erpId: m.erpId ?? '—',
            status,
            statusVariant: TEAM_STATUS_BADGE_VARIANT[status],
        };
    }),
);
</script>

<template>
    <MvAdvancedDataTable
        v-model:table-state="tableState"
        :columns="ALL_COLUMNS"
        :rows="rows"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        data-key="id"
        :row-height-px="49"
        :header-height-px="65"
        :default-filters="BLANK_FILTERS"
        :search="{ filterKey: 'name', placeholder: t('team.table.searchPlaceholder') }"
        :empty-message="t('team.table.empty')"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #toolbar-start>
            <slot name="view-chips" />
        </template>
        <template #toolbar-end>
            <MvButton
                v-if="canManageUsers"
                variant="secondary"
                size="sm"
                @click="emit('manage-users')"
            >
                {{ t('team.table.manageRoles') }}
            </MvButton>
        </template>

        <template #cell-roles="{ data }">
            <span v-if="!(data as TeamRow).roles.length">—</span>
            <span v-else class="team-directory-table__roles">
                <MvStatusBadge v-for="code in (data as TeamRow).roles" :key="code" variant="info">
                    {{ code }}
                </MvStatusBadge>
            </span>
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as TeamRow).statusVariant">
                {{ t(`team.status.${(data as TeamRow).status}`) }}
            </MvStatusBadge>
        </template>
    </MvAdvancedDataTable>
</template>

<style scoped>
.team-directory-table__roles {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}
</style>
