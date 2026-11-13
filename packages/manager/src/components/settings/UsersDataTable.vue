<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
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
import { useAuthStore } from '../../stores/auth';

// Email is the identifying/searched column: unique per administrator, unlike the name.
const { t } = useI18n();
const props = defineProps<{
    users: PortalUser[];
    loading: boolean;
    totalItems: number;
    page: number;
    pageSize: number;
    statusFilter: string;
    searchFilter: string;
    roles: RoleSummary[];
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
    'edit-limits': [user: PortalUser];
}>();

const canManageLimits = useAuthStore().hasPermission('ManageDiscountLimits');

const ALL_COLUMNS = computed<AdvancedDataTableColumn[]>(() => [
    {
        field: 'name',
        header: t('settingsAccess.users.columns.name'),
        width: 200,
        filterConfig: { type: 'none' },
        mobile: { primary: true },
    },
    {
        field: 'emailAddress',
        header: t('settingsAccess.users.columns.email'),
        width: 220,
        required: true,
        filterConfig: { type: 'text', placeholder: t('settingsAccess.users.filters.email') },
    },
    {
        field: 'department',
        header: t('settingsAccess.users.columns.department'),
        width: 160,
        filterConfig: { type: 'none' },
    },
    {
        field: 'role',
        header: t('settingsAccess.users.columns.role'),
        width: 190,
        filterConfig: { type: 'none' },
    },
    {
        field: 'status',
        header: t('settingsAccess.users.columns.status'),
        width: 110,
        filterConfig: {
            type: 'status',
            placeholder: t('settingsAccess.users.filters.allStatuses'),
            options: [
                {
                    value: 'active',
                    label: t('settingsAccess.users.status.active'),
                    variant: 'success',
                },
                {
                    value: 'inactive',
                    label: t('settingsAccess.users.status.inactive'),
                    variant: 'neutral',
                },
            ],
        },
        mobile: { badge: true },
    },
    {
        field: 'active',
        header: t('settingsAccess.users.columns.active'),
        width: 90,
        filterConfig: { type: 'none' },
    },
    { field: 'actions', header: '', width: 260, filterConfig: { type: 'none' } },
]);

interface UserFilterState {
    [key: string]: unknown;
    status: string;
    emailAddress: string;
}
const BLANK_FILTERS: UserFilterState = { status: '', emailAddress: '' };

const { state: tableState } = useDataTableState<UserFilterState>(
    'settings-users-datatable',
    {
        columnOrder: ALL_COLUMNS.value.map(c => c.field),
        columnWidths: Object.fromEntries(ALL_COLUMNS.value.map(c => [c.field, c.width])),
        hiddenColumns: [],
        sort: [],
        filters: { status: props.statusFilter, emailAddress: props.searchFilter },
        pageSize: props.pageSize,
    },
    {
        columns: ALL_COLUMNS.value,
        allowedFilterKeys: ['status', 'emailAddress'],
        // status/search/pageSize are owned by UsersPage.vue, which runs the real fetch.
        externallyOwned: { pageSize: true, filterKeys: ['status', 'emailAddress'] },
    },
);

watch(
    () => tableState.value.filters,
    f => emit('update:filters', { status: f.status, search: f.emailAddress }),
    { deep: true },
);
watch(
    () => tableState.value.pageSize,
    size => emit('update:page-size', size),
);
watch(
    () => props.statusFilter,
    v => {
        tableState.value.filters = { ...tableState.value.filters, status: v };
    },
);
watch(
    () => props.searchFilter,
    v => {
        tableState.value.filters = { ...tableState.value.filters, emailAddress: v };
    },
);
watch(
    () => props.pageSize,
    v => {
        tableState.value.pageSize = v;
    },
);

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
        role:
            props.roles.find(r => r.code === u.roleCodes[0])?.code ??
            t('settingsAccess.users.noRole'),
        roleId: props.roles.find(r => r.code === u.roleCodes[0])?.id ?? '',
        status: u.isActive ? 'active' : 'inactive',
        isActive: u.isActive,
        user: u,
    })),
);

// Only deactivation asks for confirmation, so the modal opens from the OFF direction only.
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
        :search="{ filterKey: 'emailAddress', placeholder: t('settingsAccess.users.search') }"
        :empty-message="t('settingsAccess.users.empty')"
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
                {{
                    (data as UserRow).isActive
                        ? t('settingsAccess.users.status.active')
                        : t('settingsAccess.users.status.inactive')
                }}
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
                {{ t('settingsAccess.users.resendLink') }}
            </MvButton>
            <MvButton
                v-if="canManageLimits"
                variant="secondary"
                size="sm"
                @click="emit('edit-limits', (data as UserRow).user)"
            >
                {{ t('settingsAccess.users.discountLimits') }}
            </MvButton>
        </template>
    </MvAdvancedDataTable>

    <MvModal
        v-if="confirmTarget"
        :title="t('settingsAccess.users.deactivateTitle')"
        @close="confirmTarget = null"
    >
        <p class="users-table__confirm-text">
            {{ t('settingsAccess.users.deactivateText', { name: confirmTarget.name }) }}
        </p>
        <div class="users-table__confirm-actions">
            <MvButton variant="secondary" @click="confirmTarget = null">{{
                t('common.cancel')
            }}</MvButton>
            <MvButton variant="danger" @click="confirmDeactivate">{{
                t('settingsAccess.users.deactivate')
            }}</MvButton>
        </div>
    </MvModal>
</template>

<style scoped>
.users-table__confirm-text {
    margin: 0 0 18px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    line-height: 1.5;
}

.users-table__confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
