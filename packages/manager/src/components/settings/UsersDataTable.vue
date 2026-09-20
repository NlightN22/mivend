<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
    MvButton,
    MvModal,
    MvSelect,
    MvStatusBadge,
    MvSwitch,
    MvAdvancedDataTable,
    useDataTableState,
    type AdvancedDataTableColumn,
} from '@mivend/ui-kit';
import type { PortalUser } from '../../api/users';
import type { RoleSummary } from '../../api/settings';

// Settings > Users (issue #119 Phase 2) — created manager-portal accounts. Server-side paginated
// + filtered, same shape as CustomerInvoicesDataTable.vue (manager-table-standard skill). Email
// is the identifying/searched column (point 1): unique per Administrator, unlike Name, which can
// collide and isn't guaranteed unique the way an order/invoice number is.
const props = defineProps<{
    users: PortalUser[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    statusFilter: string;
    searchFilter: string;
    roles: RoleSummary[];
    // Row-scoped async state, keyed by administrator id — mirrors CustomerTeamTab.vue's
    // rowState shape for the same "saving one row at a time" concern.
    savingRoleId: string | null;
    resendingId: string | null;
    departmentName: (departmentId: string | null) => string;
}>();

const emit = defineEmits<{
    'update:filters': [filters: { status: string; search: string }];
    'update:page': [page: number];
    'update:page-size': [size: number];
    'toggle-active': [user: PortalUser, isActive: boolean];
    'change-role': [user: PortalUser, roleId: string];
    'resend-password-reset': [user: PortalUser];
}>();

const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    { field: 'name', header: 'Name', width: 200, filterConfig: { type: 'none' }, mobile: { primary: true } },
    {
        field: 'emailAddress',
        header: 'Email',
        width: 220,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Email contains…' },
    },
    { field: 'department', header: 'Department', width: 160, filterConfig: { type: 'none' } },
    { field: 'role', header: 'Role', width: 190, filterConfig: { type: 'none' } },
    {
        field: 'status',
        header: 'Status',
        width: 110,
        filterConfig: {
            type: 'status',
            placeholder: 'All',
            options: [
                { value: 'active', label: 'Active', variant: 'success' },
                { value: 'inactive', label: 'Inactive', variant: 'neutral' },
            ],
        },
        mobile: { badge: true },
    },
    { field: 'active', header: 'Active', width: 90, filterConfig: { type: 'none' } },
    { field: 'actions', header: '', width: 130, filterConfig: { type: 'none' } },
];

interface UserFilterState {
    [key: string]: unknown;
    status: string;
    emailAddress: string;
}
const BLANK_FILTERS: UserFilterState = { status: '', emailAddress: '' };

const { state: tableState } = useDataTableState<UserFilterState>(
    'settings-users-datatable',
    {
        columnOrder: ALL_COLUMNS.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { status: props.statusFilter, emailAddress: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS,
        allowedFilterKeys: ['status', 'emailAddress'],
        // status/search/pageSize are owned by UsersPage.vue (the real fetch) — see
        // CustomerInvoicesDataTable.vue's identical `externallyOwned` for why.
        externallyOwned: { pageSize: true, filterKeys: ['status', 'emailAddress'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { status: f.status, search: f.emailAddress }),
    { deep: true },
);
watch(() => tableState.value.pageSize, size => emit('update:page-size', size));
watch(() => props.statusFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, status: v };
});
watch(() => props.searchFilter, v => {
    tableState.value.filters = { ...tableState.value.filters, emailAddress: v };
});
watch(() => props.pageSize, v => {
    tableState.value.pageSize = v;
});

interface UserRow {
    [key: string]: unknown;
    id: string;
    name: string;
    emailAddress: string;
    department: string;
    role: string;
    roleId: string;
    status: string;
    isActive: boolean;
    user: PortalUser;
}
const rows = computed<UserRow[]>(() =>
    props.users.map(u => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        emailAddress: u.emailAddress,
        department: props.departmentName(u.departmentId),
        role: props.roles.find(r => r.code === u.roleCodes[0])?.code ?? 'No role',
        roleId: props.roles.find(r => r.code === u.roleCodes[0])?.id ?? '',
        status: u.isActive ? 'active' : 'inactive',
        isActive: u.isActive,
        user: u,
    })),
);

// Confirmation is required only for deactivation (issue #119 Phase 2 concept notes) — flipping a
// switch back on needs no modal, so this only ever gets opened by the OFF direction.
const confirmTarget = ref<UserRow | null>(null);
function onToggle(row: UserRow, next: boolean): void {
    if (!next) {
        confirmTarget.value = row;
        return;
    }
    emit('toggle-active', row.user, true);
}
function confirmDeactivate(): void {
    if (confirmTarget.value) emit('toggle-active', confirmTarget.value.user, false);
    confirmTarget.value = null;
}
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
        :search="{ filterKey: 'emailAddress', placeholder: 'Search by email…' }"
        empty-message="No users match your filters"
        @update:page="p => emit('update:page', p)"
        @reset-page="emit('update:page', 1)"
    >
        <template #toolbar-start>
            <slot name="view-chips" />
        </template>

        <template #cell-role="{ data }">
            <MvSelect
                :model-value="(data as UserRow).roleId"
                :options="roles.map(r => ({ value: r.id, label: r.code }))"
                :disabled="savingRoleId === (data as UserRow).id"
                @update:model-value="emit('change-role', (data as UserRow).user, $event)"
            />
        </template>
        <template #cell-status="{ data }">
            <MvStatusBadge :variant="(data as UserRow).isActive ? 'success' : 'neutral'">
                {{ (data as UserRow).isActive ? 'Active' : 'Inactive' }}
            </MvStatusBadge>
        </template>
        <template #cell-active="{ data }">
            <MvSwitch
                :model-value="(data as UserRow).isActive"
                @update:model-value="onToggle(data as UserRow, $event)"
            />
        </template>
        <template #cell-actions="{ data }">
            <MvButton
                variant="secondary"
                size="sm"
                :loading="resendingId === (data as UserRow).id"
                @click="emit('resend-password-reset', (data as UserRow).user)"
            >
                Resend reset link
            </MvButton>
        </template>
    </MvAdvancedDataTable>

    <MvModal v-if="confirmTarget" title="Deactivate user?" @close="confirmTarget = null">
        <p class="users-table__confirm-text">
            {{ confirmTarget.name }} will no longer be able to sign in to the manager portal. You
            can activate the account again later.
        </p>
        <div class="users-table__confirm-actions">
            <MvButton variant="secondary" @click="confirmTarget = null">Cancel</MvButton>
            <MvButton variant="danger" @click="confirmDeactivate">Deactivate</MvButton>
        </div>
    </MvModal>
</template>

<style scoped>
.users-table__confirm-text {
    margin: 0 0 18px;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
    line-height: 1.5;
}

.users-table__confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
