<script setup lang="ts">
import { onMounted } from 'vue';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useCheckPolicies } from '../../composables/useCheckPolicies';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import CheckPoliciesTable from '../../components/settings/CheckPoliciesTable.vue';

const authStore = useAuthStore();
const { rows, loading, savingKey, error, load, save } = useCheckPolicies();

onMounted(() => {
    if (authStore.hasPermission('ManageCheckPolicies')) void load();
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
                always accepted: consequences stronger than hold are not available.
            </p>
            <p v-if="loading">Loading…</p>
            <CheckPoliciesTable v-else :rows="rows" :saving-key="savingKey" @save="save" />
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
