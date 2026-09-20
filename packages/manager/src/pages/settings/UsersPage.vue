<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useLatestRequest, MvFilterChips, MvNotice, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import UsersDataTable from '../../components/settings/UsersDataTable.vue';
import PendingErpUsersDataTable from '../../components/settings/PendingErpUsersDataTable.vue';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { fetchRoles, updateAdministratorRole, type RoleSummary } from '../../api/settings';
import { fetchDepartments, type DepartmentOption } from '../../api/team';
import {
    fetchPortalUsers,
    fetchPendingErpUsers,
    fetchPortalUserCounts,
    setAdministratorActive,
    createAdministratorFromErpUser,
    type PortalUser,
    type PendingErpUserRow,
} from '../../api/users';

// Issue #119 Phase 2. Renamed from "Team" to "Users" per the concept notes: this page manages
// manager-portal login accounts, not org structure (the org-structure directory lives at /team,
// a separate route/page — see router/index.ts). "Users"/"Pending" is a compact dataset switcher,
// not a second level of Settings tabs — see MvFilterChips reused here for exactly that, same
// component the view-chip quick filters elsewhere use, just switching which query runs rather
// than filtering one query's results.
const authStore = useAuthStore();

type ViewKey = 'users' | 'pending';
const view = ref<ViewKey>('users');
const counts = ref({ users: 0, pending: 0 });
const viewChips = computed<FilterChip[]>(() => [
    { key: 'users', label: `Users ${counts.value.users}` },
    { key: 'pending', label: `Pending ${counts.value.pending}` },
]);

const departments = ref<DepartmentOption[]>([]);
function departmentName(departmentId: string | null): string {
    if (!departmentId) return '—';
    return departments.value.find(d => d.erpId === departmentId)?.name ?? departmentId;
}

const roles = ref<RoleSummary[]>([]);
const savingRoleId = ref<string | null>(null);
// Real incident this fixes: Create administrator/Activate-Deactivate/role-change all threw
// silently on failure (e.g. a stale/incompatible admin-api schema) — the button's own loading
// state cleared in `finally`, so the UI looked like nothing had happened at all instead of
// surfacing an error.
const actionError = ref('');

// Users dataset state
const pageSize = ref(20);
const page = ref(1);
const totalItems = ref(0);
const users = ref<PortalUser[]>([]);
const statusFilter = ref('');
const searchFilter = ref('');

// Pending dataset state
const pendingPage = ref(1);
const pendingPageSize = ref(20);
const pendingTotalItems = ref(0);
const pendingUsers = ref<PendingErpUserRow[]>([]);
const pendingSearchFilter = ref('');
const creatingErpId = ref<string | null>(null);

interface UrlFilters {
    [key: string]: string;
    view: string;
    status: string;
    search: string;
    pageSize: string;
}
const URL_FILTER_DEFAULTS: UrlFilters = { view: 'users', status: '', search: '', pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.view === 'pending') view.value = 'pending';
    if (parsed.status) statusFilter.value = parsed.status;
    if (parsed.search) searchFilter.value = parsed.search;
    if (parsed.pageSize) pageSize.value = Number(parsed.pageSize);
}

function buildUrlFilters(): UrlFilters {
    return {
        view: view.value,
        status: statusFilter.value,
        search: searchFilter.value,
        pageSize: String(pageSize.value),
    };
}

const { loading: usersLoading, run: loadUsers } = useLatestRequest(
    () =>
        fetchPortalUsers(
            {
                skip: (page.value - 1) * pageSize.value,
                take: pageSize.value,
                filter: searchFilter.value ? { emailAddress: { contains: searchFilter.value } } : undefined,
            },
            (statusFilter.value || undefined) as 'active' | 'inactive' | undefined,
        ),
    result => {
        users.value = result.items;
        totalItems.value = result.totalItems;
    },
);

const { loading: pendingLoading, run: loadPending } = useLatestRequest(
    () =>
        fetchPendingErpUsers({
            skip: (pendingPage.value - 1) * pendingPageSize.value,
            take: pendingPageSize.value,
            filter: pendingSearchFilter.value
                ? { fullName: { contains: pendingSearchFilter.value } }
                : undefined,
        }),
    result => {
        pendingUsers.value = result.items;
        pendingTotalItems.value = result.totalItems;
    },
);

async function loadCounts(): Promise<void> {
    counts.value = await fetchPortalUserCounts();
}

watch([statusFilter, searchFilter, pageSize], () => {
    page.value = 1;
});
// useLatestRequest has no built-in error channel (see its own source) — every other table in
// the manager portal shares this same gap (CustomerInvoicesTab.vue etc. all call `void load()`
// too), pre-existing and out of scope to fix broadly here; this page wraps its own calls so a
// failed fetch is at least visible instead of leaving the table stuck on stale/empty data with
// no explanation.
async function safeLoadUsers(): Promise<void> {
    try {
        await loadUsers();
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not load users';
    }
}
async function safeLoadPending(): Promise<void> {
    try {
        await loadPending();
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not load pending users';
    }
}

watch([page, statusFilter, searchFilter, pageSize], () => {
    if (view.value === 'users') void safeLoadUsers();
    toQuery(buildUrlFilters(), page);
});
watch(view, v => {
    toQuery(buildUrlFilters(), page);
    if (v === 'users' && users.value.length === 0) void safeLoadUsers();
    if (v === 'pending' && pendingUsers.value.length === 0) void safeLoadPending();
});
watch(pendingSearchFilter, () => {
    pendingPage.value = 1;
});
watch([pendingPage, pendingSearchFilter, pendingPageSize], () => void safeLoadPending());

function onUsersFilters(filters: { status: string; search: string }): void {
    statusFilter.value = filters.status;
    searchFilter.value = filters.search;
}

async function onToggleActive(user: PortalUser, isActive: boolean): Promise<void> {
    actionError.value = '';
    try {
        await setAdministratorActive(user.id, isActive);
        await Promise.all([loadUsers(), loadCounts()]);
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not update the account status';
    }
}

async function onChangeRole(user: PortalUser, roleId: string): Promise<void> {
    actionError.value = '';
    savingRoleId.value = user.id;
    try {
        await updateAdministratorRole(user.id, roleId);
        await loadUsers();
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not update the role';
    } finally {
        savingRoleId.value = null;
    }
}

async function onCreateAdministrator(erpId: string): Promise<void> {
    actionError.value = '';
    creatingErpId.value = erpId;
    try {
        await createAdministratorFromErpUser(erpId);
        await Promise.all([loadPending(), loadCounts()]);
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not create the administrator';
    } finally {
        creatingErpId.value = null;
    }
}

onMounted(async () => {
    await Promise.all([
        fetchDepartments().then(d => (departments.value = d)),
        fetchRoles().then(r => (roles.value = r)),
        loadCounts(),
    ]);
    if (view.value === 'pending') {
        void safeLoadPending();
    } else {
        void safeLoadUsers();
    }
});
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageAdministratorLifecycle')" class="users-page__not-authorized">
        <h1>Not authorized</h1>
        <p>You don't have permission to manage users.</p>
    </div>

    <div v-else class="users-page">
        <div class="users-page__breadcrumb">Workspace / Settings</div>
        <h1 class="users-page__title">Users</h1>
        <SettingsSubNav active="users" />

        <MvNotice v-if="actionError" variant="error">{{ actionError }}</MvNotice>

        <UsersDataTable
            v-if="view === 'users'"
            :users="users"
            :loading="usersLoading"
            :total-items="totalItems"
            :page="page"
            :page-size="pageSize"
            :status-filter="statusFilter"
            :search-filter="searchFilter"
            :roles="roles"
            :saving-role-id="savingRoleId"
            :department-name="departmentName"
            @update:filters="onUsersFilters"
            @update:page="page = $event"
            @update:page-size="pageSize = $event"
            @toggle-active="onToggleActive"
            @change-role="onChangeRole"
        >
            <template #view-chips>
                <MvFilterChips :chips="viewChips" :active="view" @select="view = $event as ViewKey" />
            </template>
        </UsersDataTable>

        <PendingErpUsersDataTable
            v-else
            :users="pendingUsers"
            :loading="pendingLoading"
            :total-items="pendingTotalItems"
            :page="pendingPage"
            :page-size="pendingPageSize"
            :search-filter="pendingSearchFilter"
            :creating-erp-id="creatingErpId"
            :department-name="departmentName"
            @update:search="pendingSearchFilter = $event"
            @update:page="pendingPage = $event"
            @update:page-size="pendingPageSize = $event"
            @create="onCreateAdministrator"
        >
            <template #view-chips>
                <MvFilterChips :chips="viewChips" :active="view" @select="view = $event as ViewKey" />
            </template>
        </PendingErpUsersDataTable>
    </div>
</template>

<style scoped>
.users-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.users-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.users-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.users-page__not-authorized {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
