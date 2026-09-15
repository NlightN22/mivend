<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import SettingsSubNav from '../../components/settings/SettingsSubNav.vue';
import OrganizationsTable from '../../components/settings/OrganizationsTable.vue';
import { fetchOrganizations, type OrganizationRequisites } from '../../api/organizations';

const authStore = useAuthStore();

const organizations = ref<OrganizationRequisites[]>([]);
const loadError = ref('');
const loading = ref(true);

// Organizations are a bounded set of the business's own legal entities (a handful at most) —
// exempt from server pagination per the backend-plugin-rules skill's Pagination section, same
// exemption class as BranchSettingsPage.vue's warehouse list. Still rendered via
// MvAdvancedDataTable (manager-table-standard point 6) with client-side search — the search is
// still a real, user-facing filter someone may want to share/bookmark, so it (and the page
// number) stay URL-synced.
const search = ref('');
const page = ref(1);
const pageSize = ref(20);

interface OrganizationsUrlFilters {
    [key: string]: string;
    organizationsSearch: string;
}
const URL_FILTER_DEFAULTS: OrganizationsUrlFilters = { organizationsSearch: '' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.organizationsSearch) search.value = parsed.organizationsSearch;
}

function buildUrlFilters(): OrganizationsUrlFilters {
    return { organizationsSearch: search.value };
}
watch(search, () => {
    page.value = 1;
});
watch([search, page], () => {
    toQuery(buildUrlFilters(), page);
});

const filteredOrganizations = computed<OrganizationRequisites[]>(() => {
    const term = search.value.trim().toLowerCase();
    if (!term) return organizations.value;
    return organizations.value.filter(o => o.legalName.toLowerCase().includes(term));
});
const pagedOrganizations = computed<OrganizationRequisites[]>(() => {
    const start = (page.value - 1) * pageSize.value;
    return filteredOrganizations.value.slice(start, start + pageSize.value);
});

function onFilters(filters: { search: string }): void {
    search.value = filters.search;
}

async function loadAll(): Promise<void> {
    loading.value = true;
    loadError.value = '';
    try {
        organizations.value = await fetchOrganizations();
    } catch (e) {
        loadError.value = e instanceof Error ? e.message : 'Could not load organizations';
    } finally {
        loading.value = false;
    }
}

onMounted(loadAll);
</script>

<template>
    <div v-if="!authStore.hasPermission('ManageAccessControl')" class="organizations-page__not-authorized">
        <h1>Not authorized</h1>
        <p>You don't have permission to view organizations.</p>
    </div>

    <div v-else class="organizations-page">
        <div class="organizations-page__breadcrumb">Workspace / Settings</div>
        <h1 class="organizations-page__title">Organizations</h1>
        <SettingsSubNav active="organizations" />

        <MvNotice v-if="loadError" variant="error">{{ loadError }}</MvNotice>

        <MvPanel title="Legal entities">
            <template #subheader>
                <p class="organizations-page__description">
                    Read-only view of the business's own legal entities as reported by the ERP,
                    and whether full legal requisites have arrived yet for each one.
                </p>
            </template>

            <OrganizationsTable
                :organizations="pagedOrganizations"
                :loading="loading"
                :total-items="filteredOrganizations.length"
                :page="page"
                :page-size="pageSize"
                :search-filter="search"
                :administrator-id="authStore.administrator?.id ?? 'anonymous'"
                @update:filters="onFilters"
                @update:page="page = $event"
                @update:page-size="pageSize = $event"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.organizations-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 1000px;
}

.organizations-page__description {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}

.organizations-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.organizations-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.organizations-page__not-authorized {
    padding: 60px 0;
    text-align: center;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
