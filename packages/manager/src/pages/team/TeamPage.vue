<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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

onMounted(load);

const membersInActiveDepartment = computed(() =>
    members.value.filter(m => m.departmentId === activeDepartmentId.value),
);
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
                    v-for="department in departments"
                    :key="department.id"
                    type="button"
                    class="team-page__tab"
                    :class="{ 'team-page__tab--active': activeDepartmentId === department.erpId }"
                    @click="activeDepartmentId = department.erpId"
                >
                    {{ department.name }}
                </button>
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
    gap: 8px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
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
}

.team-page__tab--active {
    color: var(--el-color-primary-dark-2, #008a70);
    border-bottom-color: var(--el-color-primary, #00b894);
}
</style>
