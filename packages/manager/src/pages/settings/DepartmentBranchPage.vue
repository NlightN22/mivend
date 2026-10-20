<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MvNotice, MvPanel, MvSwitch } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useDepartmentBranch } from '../../composables/useDepartmentBranch';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import DepartmentBranchTable from '../../components/settings/DepartmentBranchTable.vue';

const authStore = useAuthStore();
const {
    rows,
    branches,
    branchName,
    loading,
    savingId,
    error,
    unmappedWithPeopleCount,
    load,
    assign,
} = useDepartmentBranch();
const onlyUnmapped = ref(false);

onMounted(() => {
    if (authStore.hasPermission('ManageAccessControl')) void load();
});
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageAccessControl')" class="department-branch__denied">
        <h1>Not authorized</h1>
        <p>You don't have permission to manage the department to branch mapping.</p>
    </div>

    <div v-else class="department-branch">
        <div class="department-branch__breadcrumb">Workspace / Settings</div>
        <h1 class="department-branch__title">Departments to branch</h1>
        <SettingsSubNav active="department-branch" />

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel title="Branch of each department">
            <template #subheader>
                <p class="department-branch__lead">
                    A branch set on a department applies to all its sub-departments until a deeper
                    one is set. Administrators and counterparties of an unmapped department get no
                    branch, so branch-scoped roles do not see them. Changes apply right away.
                </p>
            </template>
            <MvSwitch
                v-model="onlyUnmapped"
                :label="`Only unmapped departments with users or counterparties (${unmappedWithPeopleCount})`"
            />
            <DepartmentBranchTable
                :rows="rows"
                :branches="branches"
                :branch-name="branchName"
                :loading="loading"
                :saving-id="savingId"
                :only-unmapped="onlyUnmapped"
                :administrator-id="authStore.administrator?.id ?? 'anonymous'"
                @assign="assign"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.department-branch {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 1100px;
}

.department-branch__lead {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.department-branch__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.department-branch__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.department-branch__denied {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
