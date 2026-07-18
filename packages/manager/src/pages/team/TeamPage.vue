<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { MvPanel, MvNotice } from '@mivend/ui-kit';
import { fetchDepartments, fetchTeamDirectory, fetchBranchOptions } from '../../api/team';
import type { DepartmentOption, TeamDirectoryMember, BranchOption } from '../../api/team';
import TeamDirectoryTable from '../../components/team/TeamDirectoryTable.vue';

const departments = ref<DepartmentOption[]>([]);
const members = ref<TeamDirectoryMember[]>([]);
const branches = ref<BranchOption[]>([]);
const activeDepartmentId = ref<string | null>(null);
const loading = ref(true);
const error = ref('');

async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
        const [departmentList, memberList, branchList] = await Promise.all([
            fetchDepartments(),
            fetchTeamDirectory(),
            fetchBranchOptions(),
        ]);
        departments.value = departmentList;
        members.value = memberList;
        branches.value = branchList;
        activeDepartmentId.value = departmentList[0]?.erpId ?? null;
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load the team directory';
    } finally {
        loading.value = false;
    }
}

const membersInActiveDepartment = computed(() =>
    members.value.filter(m => m.departmentId === activeDepartmentId.value),
);

// Mobile-only tab-overflow pattern, see AGENTS.md's "Manager portal rules" — a plain flex-wrap
// row (the old behaviour here) avoids the document-overflow bug but still isn't the standard
// pattern once there are more departments than a mobile row comfortably fits; same
// primary/overflow split as CustomerDetailPage.vue, gated on the same `max-width: 800px`
// breakpoint MvAppTopbar/MvAppMobileNav use. Desktop still shows the full row.
const MOBILE_BREAKPOINT = '(max-width: 800px)';
const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);
const isMobile = ref(mobileQuery.matches);
function handleMobileQueryChange(e: MediaQueryListEvent): void {
    isMobile.value = e.matches;
}

const PRIMARY_TAB_COUNT = 3;
const primaryDepartments = computed(() => (isMobile.value ? departments.value.slice(0, PRIMARY_TAB_COUNT) : departments.value));
const overflowDepartments = computed(() => (isMobile.value ? departments.value.slice(PRIMARY_TAB_COUNT) : []));
const isOverflowActive = computed(() => overflowDepartments.value.some(d => d.erpId === activeDepartmentId.value));
const activeOverflowLabel = computed(
    () => overflowDepartments.value.find(d => d.erpId === activeDepartmentId.value)?.name ?? 'More',
);
const tabsMoreOpen = ref(false);
const tabsMoreRef = ref<HTMLElement | null>(null);

function selectDepartment(erpId: string): void {
    activeDepartmentId.value = erpId;
    tabsMoreOpen.value = false;
}

function handleOutsideClick(e: MouseEvent): void {
    if (tabsMoreRef.value && !tabsMoreRef.value.contains(e.target as Node)) {
        tabsMoreOpen.value = false;
    }
}

onMounted(() => {
    load();
    document.addEventListener('click', handleOutsideClick);
    mobileQuery.addEventListener('change', handleMobileQueryChange);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', handleOutsideClick);
    mobileQuery.removeEventListener('change', handleMobileQueryChange);
});
</script>

<template>
    <div class="team-page">
        <div class="team-page__header">
            <div class="team-page__breadcrumb">Workspace</div>
            <h1 class="team-page__title">Team</h1>
        </div>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <template v-else-if="!loading">
            <div v-if="departments.length" class="team-page__tabs">
                <button
                    v-for="department in primaryDepartments"
                    :key="department.id"
                    type="button"
                    class="team-page__tab"
                    :class="{ 'team-page__tab--active': activeDepartmentId === department.erpId }"
                    @click="selectDepartment(department.erpId)"
                >
                    {{ department.name }}
                </button>
                <div v-if="overflowDepartments.length" ref="tabsMoreRef" class="team-page__tabs-more">
                    <button
                        type="button"
                        class="team-page__tab team-page__tabs-more-trigger"
                        :class="{ 'team-page__tab--active': isOverflowActive }"
                        @click="tabsMoreOpen = !tabsMoreOpen"
                    >
                        {{ isOverflowActive ? activeOverflowLabel : 'More' }} ▾
                    </button>
                    <div v-if="tabsMoreOpen" class="team-page__tabs-more-menu">
                        <button
                            v-for="department in overflowDepartments"
                            :key="department.id"
                            type="button"
                            class="team-page__tabs-more-menu-item"
                            :class="{ active: activeDepartmentId === department.erpId }"
                            @click="selectDepartment(department.erpId)"
                        >
                            {{ department.name }}
                        </button>
                    </div>
                </div>
            </div>

            <MvPanel title="Employees">
                <TeamDirectoryTable :members="membersInActiveDepartment" :branches="branches" />
            </MvPanel>
        </template>
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

.team-page__tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    position: relative;
}

.team-page__tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 4px;
    font-size: 14px;
    font-weight: 700;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
    white-space: nowrap;
}

.team-page__tab--active {
    color: var(--el-color-primary-dark-2, #008a70);
    border-bottom-color: var(--el-color-primary, #00b894);
}

.team-page__tabs-more {
    position: relative;
}

.team-page__tabs-more-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    padding: 6px;
    background: var(--app-surface, #fff);
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(20, 42, 65, 0.12);
}

.team-page__tabs-more-menu-item {
    background: none;
    border: none;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 14px;
    font-weight: 700;
    text-align: left;
    color: var(--el-text-color-secondary, #6b7280);
    cursor: pointer;
}

.team-page__tabs-more-menu-item:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

.team-page__tabs-more-menu-item.active {
    color: var(--el-color-primary-dark-2, #008a70);
    background: var(--el-color-primary-light-9, #f0fffa);
}
</style>
