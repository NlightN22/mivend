<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvWarningBanner } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { usePowersOfAttorneyList } from '../../composables/usePowersOfAttorneyList';
import { BLANK_POWERS_OF_ATTORNEY_FILTERS } from '../../api/powersOfAttorneyList';
import PowersOfAttorneyListTable from './PowersOfAttorneyListTable.vue';
import { toPowerOfAttorneyRows } from './powersOfAttorneyRows';

const { t } = useI18n();
const authStore = useAuthStore();
const list = usePowersOfAttorneyList();
const rows = computed(() => toPowerOfAttorneyRows(list.items.value));

function clearFilters(): void {
    list.filters.value = { ...BLANK_POWERS_OF_ATTORNEY_FILTERS };
}
</script>

<template>
    <MvWarningBanner
        v-if="list.counterpartyId.value"
        :action-text="t('erpDocuments.list.showAll')"
        @action="list.counterpartyId.value = ''"
    >
        {{ t('erpDocuments.list.filteredToCustomer') }}
    </MvWarningBanner>
    <PowersOfAttorneyListTable
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
