<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useLatestRequest } from '@mivend/ui-kit';
import CustomerDocumentsDataTable from './CustomerDocumentsDataTable.vue';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import { useAuthStore } from '../../stores/auth';
import {
    fetchDocumentsPageForCounterparty,
    fetchDocumentTypes,
    DEFAULT_CUSTOMER_DOCUMENT_FILTERS,
    type CustomerDocument,
} from '../../api/customers';

// Server-side paginated + filtered (AGENTS.md "Pagination" rule) — owns its own fetching, same
// shape as CustomerDiscountsTab.vue.
const props = defineProps<{ counterpartyId: string }>();
const authStore = useAuthStore();

const pageSize = ref(20);
const page = ref(1);
const totalItems = ref(0);
const documents = ref<CustomerDocument[]>([]);
// Real distinct type values for this counterparty's documents — backs the Type column's
// checklist filter (see CustomerDocumentsDataTable.vue's ALL_COLUMNS doc comment). Loaded once on
// mount, same as any other filter-options list (compare CustomerOrdersTab.vue's managers ref).
const typeOptions = ref<string[]>([]);

const typeFilter = ref<string[]>([]);
const statusFilter = ref('');
const searchFilter = ref('');

interface DocumentUrlFilters {
    [key: string]: string;
    type: string;
    status: string;
    search: string;
    pageSize: string;
}
const URL_FILTER_DEFAULTS: DocumentUrlFilters = { type: '', status: '', search: '', pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

function buildUrlFilters(): DocumentUrlFilters {
    return {
        type: typeFilter.value.join(','),
        status: statusFilter.value,
        search: searchFilter.value,
        pageSize: String(pageSize.value),
    };
}

{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.type) typeFilter.value = parsed.type.split(',').filter(Boolean);
    if (parsed.status) statusFilter.value = parsed.status;
    if (parsed.search) searchFilter.value = parsed.search;
    if (parsed.pageSize) pageSize.value = Number(parsed.pageSize);
}

const { loading, run: load } = useLatestRequest(
    () =>
        fetchDocumentsPageForCounterparty(
            props.counterpartyId,
            page.value,
            pageSize.value,
            {
                ...DEFAULT_CUSTOMER_DOCUMENT_FILTERS,
                types: typeFilter.value,
                status: statusFilter.value,
                search: searchFilter.value,
            },
        ),
    result => {
        documents.value = result.items;
        totalItems.value = result.totalItems;
    },
);

async function loadTypeOptions(): Promise<void> {
    typeOptions.value = await fetchDocumentTypes(props.counterpartyId);
}

watch([typeFilter, statusFilter, searchFilter, pageSize], () => {
    page.value = 1;
});
watch([page, typeFilter, statusFilter, searchFilter, pageSize], () => {
    void load();
    toQuery(buildUrlFilters(), page);
});

function onDataTableFilters(filters: { types: string[]; status: string; search: string }): void {
    typeFilter.value = filters.types;
    statusFilter.value = filters.status;
    searchFilter.value = filters.search;
}

onMounted(() => {
    void load();
    void loadTypeOptions();
});
</script>

<template>
    <CustomerDocumentsDataTable
        :documents="documents"
        :loading="loading"
        :total-items="totalItems"
        :page="page"
        :page-size="pageSize"
        :type-options="typeOptions"
        :type-filter="typeFilter"
        :status-filter="statusFilter"
        :search-filter="searchFilter"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        @update:filters="onDataTableFilters"
        @update:page="page = $event"
        @update:page-size="pageSize = $event"
        @reset-page="page = 1"
    />
</template>
