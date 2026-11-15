<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvWarningBanner } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useErpDocumentsList } from '../../composables/useErpDocumentsList';
import { BLANK_ERP_DOCUMENTS_FILTERS } from '../../api/erpDocumentsList';
import type { ErpDocumentKind } from '../../api/erpDocumentKinds';
import ErpDocumentsListTable from './ErpDocumentsListTable.vue';
import { toErpDocumentRows } from './erpDocumentsRows';

const props = defineProps<{ kind: ErpDocumentKind }>();

const { t } = useI18n();
const authStore = useAuthStore();
const list = useErpDocumentsList(props.kind);
const rows = computed(() => toErpDocumentRows(list.items.value));

function clearFilters(): void {
    list.filters.value = { ...BLANK_ERP_DOCUMENTS_FILTERS };
}
function clearPreset(): void {
    list.preset.value = { orderId: '', counterpartyId: '' };
}
</script>

<template>
    <MvWarningBanner
        v-if="list.preset.value.orderId || list.preset.value.counterpartyId"
        :action-text="t('erpDocuments.list.showAll')"
        @action="clearPreset"
    >
        {{
            list.preset.value.orderId
                ? t('erpDocuments.list.filteredToOrder')
                : t('erpDocuments.list.filteredToCustomer')
        }}
    </MvWarningBanner>
    <ErpDocumentsListTable
        :kind="kind"
        :rows="rows"
        :loading="list.loading.value"
        :failed="list.failed.value"
        :total-items="list.totalItems.value"
        :page="list.page.value"
        :page-size="list.pageSize.value"
        :filters="list.filters.value"
        :sort="list.sort.value"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        @update:filters="list.filters.value = $event"
        @update:sort="list.sort.value = $event"
        @update:page="list.page.value = $event"
        @update:page-size="list.pageSize.value = $event"
        @clear-filters="clearFilters"
        @retry="list.reload"
    />
</template>
