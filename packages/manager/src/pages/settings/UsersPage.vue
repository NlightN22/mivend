<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLatestRequest, MvFilterChips, MvNotice, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import UsersDataTable from '../../components/settings/UsersDataTable.vue';
import DiscountLimitsDialog from '../../components/settings/DiscountLimitsDialog.vue';
import PendingErpUsersDataTable from '../../components/settings/PendingErpUsersDataTable.vue';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { fetchRoles, updateAdministratorRole, type RoleSummary } from '../../api/settings';
import { fetchDepartments, fetchPositions, type DepartmentOption } from '../../api/team';
import {
    fetchPortalUsers,
    fetchPendingErpUsers,
    fetchPortalUserCounts,
    setAdministratorActive,
    resendAdministratorPasswordReset,
    createAdministratorFromErpUser,
    type PortalUser,
    type PendingErpUserRow,
} from '../../api/users';

// Manages manager-portal login accounts; the org-structure directory is the separate /team page.
// Users/Pending is a dataset switcher (which query runs), not a filter of one result set.
const { t } = useI18n();
const authStore = useAuthStore();

type ViewKey = 'users' | 'pending';
const view = ref<ViewKey>('users');
const counts = ref({ users: 0, pending: 0 });
const viewChips = computed<FilterChip[]>(() => [
    { key: 'users', label: t('settingsAccess.users.chipUsers', { count: counts.value.users }) },
    {
        key: 'pending',
        label: t('settingsAccess.users.chipPending', { count: counts.value.pending }),
    },
]);

const departments = ref<DepartmentOption[]>([]);
function departmentName(departmentId: string | null): string {
    if (!departmentId) return '—';
    return departments.value.find(d => d.erpId === departmentId)?.name ?? departmentId;
}

const roles = ref<RoleSummary[]>([]);
const savingRoleId = ref<string | null>(null);
const actionError = ref('');
const actionNotice = ref('');
const resendingId = ref<string | null>(null);
const limitsTarget = ref<PortalUser | null>(null);

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
const pendingPositionFilter = ref('');
const positionOptions = ref<{ value: string; label: string }[]>([]);
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
                filter: searchFilter.value
                    ? { emailAddress: { contains: searchFilter.value } }
                    : undefined,
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
            filter: {
                ...(pendingSearchFilter.value
                    ? { fullName: { contains: pendingSearchFilter.value } }
                    : {}),
                ...(pendingPositionFilter.value
                    ? { positionErpId: { eq: pendingPositionFilter.value } }
                    : {}),
            },
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
// useLatestRequest has no error channel, so a failed fetch is surfaced here instead of leaving stale rows.
async function safeLoadUsers(): Promise<void> {
    try {
        await loadUsers();
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : t('settingsAccess.users.loadFailed');
    }
}
async function safeLoadPending(): Promise<void> {
    try {
        await loadPending();
    } catch (e) {
        actionError.value =
            e instanceof Error ? e.message : t('settingsAccess.users.loadPendingFailed');
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
watch([pendingSearchFilter, pendingPositionFilter], () => {
    pendingPage.value = 1;
});
watch(
    [pendingPage, pendingSearchFilter, pendingPositionFilter, pendingPageSize],
    () => void safeLoadPending(),
);

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
        actionError.value = e instanceof Error ? e.message : t('settingsAccess.users.statusFailed');
    }
}

async function onResendPasswordReset(user: PortalUser): Promise<void> {
    actionError.value = '';
    actionNotice.value = '';
    resendingId.value = user.id;
    try {
        await resendAdministratorPasswordReset(user.id);
        actionNotice.value = t('settingsAccess.users.resent', { email: user.emailAddress });
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : t('settingsAccess.users.resendFailed');
    } finally {
        resendingId.value = null;
    }
}

async function onChangeRole(user: PortalUser, roleId: string): Promise<void> {
    actionError.value = '';
    savingRoleId.value = user.id;
    try {
        await updateAdministratorRole(user.id, roleId);
        await loadUsers();
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : t('settingsAccess.users.roleFailed');
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
        actionError.value = e instanceof Error ? e.message : t('settingsAccess.users.createFailed');
    } finally {
        creatingErpId.value = null;
    }
}

onMounted(async () => {
    await Promise.all([
        fetchDepartments().then(d => (departments.value = d)),
        fetchPositions().then(
            p => (positionOptions.value = p.map(x => ({ value: x.erpId, label: x.name }))),
        ),
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
    <div
        v-if="!authStore.hasPermission('ManageAdministratorLifecycle')"
        class="users-page__not-authorized"
    >
        <h1>{{ t('settingsAccess.notAuthorized') }}</h1>
        <p>{{ t('settingsAccess.users.denied') }}</p>
    </div>

    <div v-else class="users-page">
        <div class="users-page__breadcrumb">{{ t('settingsAccess.breadcrumb') }}</div>
        <h1 class="users-page__title">{{ t('settingsAccess.users.title') }}</h1>

        <MvNotice v-if="actionError" variant="error">{{ actionError }}</MvNotice>
        <MvNotice v-else-if="actionNotice" variant="success">{{ actionNotice }}</MvNotice>

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
            :resending-id="resendingId"
            :department-name="departmentName"
            @update:filters="onUsersFilters"
            @update:page="page = $event"
            @update:page-size="pageSize = $event"
            @toggle-active="onToggleActive"
            @change-role="onChangeRole"
            @resend-password-reset="onResendPasswordReset"
            @edit-limits="limitsTarget = $event"
        >
            <template #view-chips>
                <MvFilterChips
                    :chips="viewChips"
                    :active="view"
                    @select="view = $event as ViewKey"
                />
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
            :position-options="positionOptions"
            @update:search="pendingSearchFilter = $event"
            @update:position="pendingPositionFilter = $event"
            @update:page="pendingPage = $event"
            @update:page-size="pendingPageSize = $event"
            @create="onCreateAdministrator"
        >
            <template #view-chips>
                <MvFilterChips
                    :chips="viewChips"
                    :active="view"
                    @select="view = $event as ViewKey"
                />
            </template>
        </PendingErpUsersDataTable>

        <DiscountLimitsDialog
            v-if="limitsTarget"
            :administrator-id="limitsTarget.id"
            :name="`${limitsTarget.firstName} ${limitsTarget.lastName}`.trim()"
            @close="limitsTarget = null"
        />
    </div>
</template>

<style scoped>
.users-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.users-page__breadcrumb {
    color: var(--el-text-color-secondary);
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
    color: var(--el-text-color-secondary);
}
</style>
