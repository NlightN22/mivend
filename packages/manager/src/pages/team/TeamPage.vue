<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { MvFilterChips, MvNotice, useLatestRequest, type FilterChip } from '@mivend/ui-kit';
import TeamDirectoryTable from '../../components/team/TeamDirectoryTable.vue';
import { useAuthStore } from '../../stores/auth';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import {
    DEFAULT_TEAM_FILTERS,
    TEAM_STATUS_BADGE_VARIANT,
    fetchBranchOptions,
    fetchDepartments,
    fetchTeamDirectoryPage,
    fetchTeamViewCounts,
    type BranchOption,
    type DepartmentOption,
    type TeamDirectoryMember,
    type TeamViewCounts,
} from '../../api/team';

const authStore = useAuthStore();
const router = useRouter();

const filters = reactive({ ...DEFAULT_TEAM_FILTERS });
const page = ref(1);
const pageSize = ref(20);
const members = ref<TeamDirectoryMember[]>([]);
const totalItems = ref(0);
const departments = ref<DepartmentOption[]>([]);
const branches = ref<BranchOption[]>([]);
const error = ref('');
const counts = ref<TeamViewCounts>({ all: 0, active: 0, inactive: 0, unassigned: 0 });

const VIEWS = [
    { key: 'all', label: 'All', variant: undefined },
    { key: 'active', label: 'Active', variant: TEAM_STATUS_BADGE_VARIANT.active },
    { key: 'unassigned', label: 'Unassigned', variant: TEAM_STATUS_BADGE_VARIANT.unassigned },
    { key: 'inactive', label: 'Inactive', variant: TEAM_STATUS_BADGE_VARIANT.inactive },
] as const;
const viewChips = computed<FilterChip[]>(() =>
    VIEWS.map(v => ({
        key: v.key,
        label: `${v.label} ${counts.value[v.key]}`,
        variant: v.variant,
    })),
);

const URL_DEFAULTS = { ...DEFAULT_TEAM_FILTERS, pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_DEFAULTS);
{
    const parsed = { ...URL_DEFAULTS };
    fromQuery(parsed, page);
    const { pageSize: urlPageSize, ...urlFilters } = parsed;
    Object.assign(filters, urlFilters);
    pageSize.value = Number(urlPageSize) || 20;
}

function syncUrl(): void {
    toQuery({ ...filters, pageSize: String(pageSize.value) }, page);
}

const { loading, run: load } = useLatestRequest(
    () => fetchTeamDirectoryPage(filters, page.value, pageSize.value),
    result => {
        members.value = result.items;
        totalItems.value = result.totalItems;
    },
);

async function loadCounts(): Promise<void> {
    counts.value = await fetchTeamViewCounts(filters);
}

async function refresh(): Promise<void> {
    error.value = '';
    try {
        await Promise.all([load(), loadCounts()]);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load the team directory';
    }
}

function onFilters(next: typeof DEFAULT_TEAM_FILTERS): void {
    Object.assign(filters, next);
}

watch(
    () => [filters.search, filters.departmentId, filters.branchId, filters.status, pageSize.value],
    () => {
        page.value = 1;
    },
);
watch(
    () => [
        filters.search,
        filters.departmentId,
        filters.branchId,
        filters.status,
        pageSize.value,
        page.value,
    ],
    () => {
        void refresh();
        syncUrl();
    },
);

onMounted(async () => {
    void refresh();
    try {
        [departments.value, branches.value] = await Promise.all([
            fetchDepartments(),
            fetchBranchOptions(),
        ]);
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load departments and branches';
    }
});
</script>

<template>
    <div class="team-page">
        <div class="team-page__header">
            <div class="team-page__breadcrumb">Workspace</div>
            <h1 class="team-page__title">Team</h1>
        </div>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <TeamDirectoryTable
            :members="members"
            :departments="departments"
            :branches="branches"
            :loading="loading"
            :total-items="totalItems"
            :page="page"
            :page-size="pageSize"
            :filters="filters"
            :administrator-id="authStore.administrator?.id ?? 'anonymous'"
            :can-manage-users="authStore.hasPermission('ManageAdministratorLifecycle')"
            @update:filters="onFilters"
            @update:page="page = $event"
            @update:page-size="pageSize = $event"
            @manage-users="router.push('/settings/users')"
        >
            <template #view-chips>
                <MvFilterChips
                    :chips="viewChips"
                    :active="filters.status"
                    @select="filters.status = $event"
                />
            </template>
        </TeamDirectoryTable>
    </div>
</template>

<style scoped>
.team-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.team-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
    margin-bottom: 6px;
}

.team-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}
</style>
