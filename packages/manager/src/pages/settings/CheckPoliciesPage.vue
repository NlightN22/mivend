<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvFormField, MvNotice, MvPanel, MvSelect } from '@mivend/ui-kit';
import { fetchBranchOptions, type BranchOption } from '../../api/branchSettings';
import { useAuthStore } from '../../stores/auth';
import { useCheckPolicies } from '../../composables/useCheckPolicies';
import CheckPoliciesTable from '../../components/settings/CheckPoliciesTable.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const { rows, branchId, loading, savingKey, error, load, selectBranch, save, reset } =
    useCheckPolicies();
const orderRows = computed(() => rows.value.filter(r => r.subjectType === 'order'));
const managerRows = computed(() => rows.value.filter(r => r.subjectType === 'manager'));
const branches = ref<BranchOption[]>([]);
const GLOBAL = '';
const scopeOptions = computed(() => [
    { value: GLOBAL, label: t('settingsSystem.policies.allBranches') },
    ...branches.value.map(b => ({ value: b.id, label: b.name })),
]);
const scope = computed({
    get: () => branchId.value ?? GLOBAL,
    set: (value: string) => void selectBranch(value === GLOBAL ? null : value),
});

onMounted(() => {
    if (!authStore.hasPermission('ManageCheckPolicies')) return;
    void load();
    void fetchBranchOptions()
        .then(list => (branches.value = list))
        .catch((e: unknown) => {
            error.value =
                e instanceof Error ? e.message : t('settingsSystem.policies.branchesFailed');
        });
});
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageCheckPolicies')" class="check-policies__denied">
        <h1>{{ t('settingsSystem.notAuthorized') }}</h1>
        <p>{{ t('settingsSystem.policies.denied') }}</p>
    </div>

    <div v-else class="check-policies">
        <div class="check-policies__breadcrumb">{{ t('settingsSystem.breadcrumb') }}</div>
        <h1 class="check-policies__title">{{ t('settingsSystem.policies.title') }}</h1>

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel :title="t('settingsSystem.policies.orderControls')">
            <p class="check-policies__lead">
                {{ t('settingsSystem.policies.orderLead') }}
            </p>
            <MvFormField :label="t('settingsSystem.policies.scope')">
                <MvSelect v-model="scope" :options="scopeOptions" />
                <p class="check-policies__lead">
                    {{ t('settingsSystem.policies.scopeLead') }}
                </p>
            </MvFormField>
            <p v-if="loading">{{ t('settingsSystem.policies.loading') }}</p>
            <CheckPoliciesTable
                v-else
                :rows="orderRows"
                :saving-key="savingKey"
                @save="save"
                @reset="reset"
            />
        </MvPanel>

        <MvPanel :title="t('settingsSystem.policies.managerControls')">
            <p class="check-policies__lead">
                {{ t('settingsSystem.policies.managerLead') }}
            </p>
            <p v-if="loading">{{ t('settingsSystem.policies.loading') }}</p>
            <CheckPoliciesTable
                v-else
                :rows="managerRows"
                :saving-key="savingKey"
                @save="save"
                @reset="reset"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.check-policies {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.check-policies__breadcrumb {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.check-policies__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.check-policies__lead {
    margin: 0 0 12px;
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.check-policies__denied {
    padding: 40px;
    text-align: center;
    color: var(--el-text-color-secondary);
}
</style>
