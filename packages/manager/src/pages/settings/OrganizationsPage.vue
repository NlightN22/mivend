<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import OrganizationsTable from '../../components/settings/OrganizationsTable.vue';
import { fetchOrganizations, type OrganizationRequisites } from '../../api/organizations';

const { t } = useI18n();
const authStore = useAuthStore();

const organizations = ref<OrganizationRequisites[]>([]);
const loadError = ref('');
const loading = ref(true);

// A bounded set of legal entities, exempt from server pagination; the client-side search stays URL-synced.
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
        loadError.value =
            e instanceof Error ? e.message : t('settingsAccess.organizations.loadFailed');
    } finally {
        loading.value = false;
    }
}

onMounted(loadAll);
</script>

<template>
    <div
        v-if="!authStore.hasPermission('ManageAccessControl')"
        class="organizations-page__not-authorized"
    >
        <h1>{{ t('settingsAccess.notAuthorized') }}</h1>
        <p>{{ t('settingsAccess.organizations.denied') }}</p>
    </div>

    <div v-else class="organizations-page">
        <div class="organizations-page__breadcrumb">{{ t('settingsAccess.breadcrumb') }}</div>
        <h1 class="organizations-page__title">{{ t('settingsAccess.organizations.title') }}</h1>

        <MvNotice v-if="loadError" variant="error">{{ loadError }}</MvNotice>

        <MvPanel :title="t('settingsAccess.organizations.panel')">
            <template #subheader>
                <p class="organizations-page__description">
                    {{ t('settingsAccess.organizations.description') }}
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
}

.organizations-page__description {
    margin: 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
}

.organizations-page__breadcrumb {
    color: var(--el-text-color-secondary);
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
    color: var(--el-text-color-secondary);
}
</style>
