<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvPanel, MvSwitch } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useDepartmentBranch } from '../../composables/useDepartmentBranch';
import DepartmentBranchTable from '../../components/settings/DepartmentBranchTable.vue';

const { t } = useI18n();
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
        <h1>{{ t('settingsAccess.notAuthorized') }}</h1>
        <p>{{ t('settingsAccess.departments.denied') }}</p>
    </div>

    <div v-else class="department-branch">
        <div class="department-branch__breadcrumb">{{ t('settingsAccess.breadcrumb') }}</div>
        <h1 class="department-branch__title">{{ t('settingsAccess.departments.title') }}</h1>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel :title="t('settingsAccess.departments.panel')">
            <template #subheader>
                <p class="department-branch__lead">
                    {{ t('settingsAccess.departments.lead') }}
                </p>
            </template>
            <MvSwitch
                v-model="onlyUnmapped"
                :label="
                    t('settingsAccess.departments.onlyUnmapped', { count: unmappedWithPeopleCount })
                "
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
}

.department-branch__lead {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.department-branch__breadcrumb {
    color: var(--el-text-color-secondary);
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
    color: var(--el-text-color-secondary);
}
</style>
