<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { MvFormField, MvNotice, MvPanel, MvSelect } from '@mivend/ui-kit';
import { fetchBranchOptions, type BranchOption } from '../../api/branchSettings';
import { useAuthStore } from '../../stores/auth';
import { useCheckPolicies } from '../../composables/useCheckPolicies';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import CheckPoliciesTable from '../../components/settings/CheckPoliciesTable.vue';

const authStore = useAuthStore();
const { rows, branchId, loading, savingKey, error, load, selectBranch, save, reset } =
    useCheckPolicies();
const orderRows = computed(() => rows.value.filter(r => r.subjectType === 'order'));
const managerRows = computed(() => rows.value.filter(r => r.subjectType === 'manager'));
const branches = ref<BranchOption[]>([]);
const GLOBAL = '';
const scopeOptions = computed(() => [
    { value: GLOBAL, label: 'All branches (global default)' },
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
            error.value = e instanceof Error ? e.message : 'Could not load branches';
        });
});
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageCheckPolicies')" class="check-policies__denied">
        <h1>Not authorized</h1>
        <p>You don't have permission to manage controls and policies.</p>
    </div>

    <div v-else class="check-policies">
        <div class="check-policies__breadcrumb">Workspace / Settings</div>
        <h1 class="check-policies__title">Controls and policies</h1>
        <SettingsSubNav active="check-policies" />

        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>

        <MvPanel title="Order controls">
            <p class="check-policies__lead">
                A control only describes a fact; its consequence is set here per stage. Orders are
                always accepted: consequences stronger than hold are not available (a quantity may
                be refused when it is added to the cart).
            </p>
            <MvFormField label="Scope">
                <MvSelect v-model="scope" :options="scopeOptions" />
                <p class="check-policies__lead">
                    A branch row overrides the global default for orders of that branch and for
                    actions of managers in it; the branch follows the global default until it is
                    saved.
                </p>
            </MvFormField>
            <p v-if="loading">Loading…</p>
            <CheckPoliciesTable
                v-else
                :rows="orderRows"
                :saving-key="savingKey"
                @save="save"
                @reset="reset"
            />
        </MvPanel>

        <MvPanel title="Manager controls">
            <p class="check-policies__lead">
                Limits on a manager's own action: the consequence applies when the action is
                requested. A per-role limit stays in the role editor; here you choose what happens
                when it is exceeded. For a credit-term control the recipient is the role whose limit
                decides the escalation.
            </p>
            <p v-if="loading">Loading…</p>
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
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.check-policies__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.check-policies__lead {
    margin: 0 0 12px;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.check-policies__denied {
    padding: 40px;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
