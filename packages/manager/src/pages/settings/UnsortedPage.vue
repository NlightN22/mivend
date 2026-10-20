<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useUnsorted } from '../../composables/useUnsorted';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import UnsortedAdministratorsTable from '../../components/settings/UnsortedAdministratorsTable.vue';
import UnsortedCounterpartiesTable from '../../components/settings/UnsortedCounterpartiesTable.vue';

const authStore = useAuthStore();
const allowed =
    authStore.hasPermission('ManageVisibilityGrants') ||
    authStore.hasPermission('ManageAccessControl');
const u = useUnsorted();
const administratorId = authStore.administrator?.id ?? 'anonymous';

watch([u.counterpartyPage, u.counterpartyPageSize, u.counterpartySearch], () => {
    void u.loadCounterparties();
});
watch([u.administratorPage, u.administratorPageSize], () => void u.loadAdministrators());
watch([u.counterpartySearch, u.counterpartyPageSize], () => (u.counterpartyPage.value = 1));

onMounted(() => {
    if (!allowed) return;
    void u.loadCounterparties();
    void u.loadAdministrators();
});
</script>

<template>
    <div v-if="!allowed" class="unsorted-page__denied">
        <h1>Not authorized</h1>
        <p>You don't have permission to see the unsorted list.</p>
    </div>

    <div v-else class="unsorted-page">
        <div class="unsorted-page__breadcrumb">Workspace / Settings</div>
        <h1 class="unsorted-page__title">Unsorted</h1>
        <SettingsSubNav active="unsorted" />

        <MvNotice variant="info">
            These counterparties and administrators have no resolvable branch, so branch-scoped
            roles do not see them. Map their department under Departments to branch, or set a branch
            on the counterparty.
        </MvNotice>
        <MvNotice v-if="u.error.value" variant="error">{{ u.error.value }}</MvNotice>

        <MvPanel title="Counterparties without a branch">
            <UnsortedCounterpartiesTable
                :items="u.counterparties.value"
                :loading="u.counterpartiesLoading.value"
                :total-items="u.counterpartyTotal.value"
                :page="u.counterpartyPage.value"
                :page-size="u.counterpartyPageSize.value"
                :search-filter="u.counterpartySearch.value"
                :administrator-id="administratorId"
                @update:search="u.counterpartySearch.value = $event"
                @update:page="u.counterpartyPage.value = $event"
                @update:page-size="u.counterpartyPageSize.value = $event"
            />
        </MvPanel>

        <MvPanel title="Administrators without a branch">
            <UnsortedAdministratorsTable
                :items="u.administrators.value"
                :loading="u.administratorsLoading.value"
                :total-items="u.administratorTotal.value"
                :page="u.administratorPage.value"
                :page-size="u.administratorPageSize.value"
                :administrator-id="administratorId"
                @update:page="u.administratorPage.value = $event"
                @update:page-size="u.administratorPageSize.value = $event"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.unsorted-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.unsorted-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.unsorted-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.unsorted-page__denied {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
