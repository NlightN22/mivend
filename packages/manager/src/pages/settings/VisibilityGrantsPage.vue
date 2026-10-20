<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { MvButton, MvNotice } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { useVisibilityGrants } from '../../composables/useVisibilityGrants';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import VisibilityGrantModal from '../../components/settings/VisibilityGrantModal.vue';
import VisibilityGrantsDataTable from '../../components/settings/VisibilityGrantsDataTable.vue';
import type { GrantInput } from '../../api/visibilityGrants';

const authStore = useAuthStore();
const allowed =
    authStore.hasPermission('ManageVisibilityGrants') ||
    authStore.hasPermission('ManageAccessControl');
const state = useVisibilityGrants();
const { rows, totalItems, page, pageSize, status, search, error, loading, administrators } = state;

const URL_DEFAULTS = { status: '', search: '', pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_DEFAULTS);
{
    const parsed = { ...URL_DEFAULTS };
    fromQuery(parsed, page);
    status.value = parsed.status;
    search.value = parsed.search;
    pageSize.value = Number(parsed.pageSize);
}

watch([status, search, pageSize], () => {
    page.value = 1;
});
watch([page, status, search, pageSize], () => {
    void state.load();
    toQuery({ status: status.value, search: search.value, pageSize: String(pageSize.value) }, page);
});

const adding = ref(false);
const saving = ref(false);
async function onSave(input: GrantInput): Promise<void> {
    saving.value = true;
    if (await state.grant(input)) adding.value = false;
    saving.value = false;
}

onMounted(() => {
    if (!allowed) return;
    void state.load();
    void state.loadAdministrators();
});
</script>

<template>
    <div v-if="!allowed" class="visibility-grants-page__denied">
        <h1>Not authorized</h1>
        <p>You don't have permission to manage visibility grants.</p>
    </div>

    <div v-else class="visibility-grants-page">
        <div class="visibility-grants-page__breadcrumb">Workspace / Settings</div>
        <h1 class="visibility-grants-page__title">Visibility grants</h1>
        <SettingsSubNav active="visibility-grants" />

        <MvNotice variant="info">
            A grant adds the clients of one more manager to an administrator's own scope. It never
            removes access. A grant without a period is permanent; every change is recorded in the
            audit log.
        </MvNotice>
        <MvNotice v-if="error && !adding" variant="error">{{ error }}</MvNotice>

        <VisibilityGrantsDataTable
            :grants="rows"
            :loading="loading"
            :total-items="totalItems"
            :page="page"
            :page-size="pageSize"
            :status-filter="status"
            :search-filter="search"
            :administrator-id="authStore.administrator?.id ?? 'anonymous'"
            @update:filters="f => ((status = f.status), (search = f.search))"
            @update:page="page = $event"
            @update:page-size="pageSize = $event"
            @revoke="(g, reason) => state.revoke(g.id, reason)"
        >
            <template #toolbar-end>
                <MvButton size="sm" @click="adding = true">Add grant</MvButton>
            </template>
        </VisibilityGrantsDataTable>

        <VisibilityGrantModal
            v-if="adding"
            :administrators="administrators"
            :error="error"
            :saving="saving"
            @close="adding = false"
            @save="onSave"
        />
    </div>
</template>

<style scoped>
.visibility-grants-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.visibility-grants-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.visibility-grants-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.visibility-grants-page__denied {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
