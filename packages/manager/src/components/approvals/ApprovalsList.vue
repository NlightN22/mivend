<script setup lang="ts">
import { computed } from 'vue';
import { MvFilterChips, type FilterChip } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useApprovalsList } from '../../composables/useApprovalsList';
import {
    APPROVALS_VIEWS,
    BLANK_APPROVALS_FILTERS,
    type ApprovalsListFilters,
    type ApprovalsView,
} from '../../api/approvals-list';
import ApprovalsListTable from './ApprovalsListTable.vue';
import { toApprovalRows } from './approvalsListRows';

const authStore = useAuthStore();
const list = useApprovalsList(() => authStore.administrator?.id ?? '');

const rows = computed(() => toApprovalRows(list.items.value, list.context.value));

const chips = computed<FilterChip[]>(() =>
    APPROVALS_VIEWS.map(v => ({
        key: v.key,
        label: v.label,
        count: list.counts.value?.[v.key],
        countLoading: list.counts.value === null,
        emphasis: v.key === 'awaiting',
    })),
);

function selectView(view: string): void {
    list.filters.value = { ...list.filters.value, view: view as ApprovalsView };
}
function applyFilters(next: ApprovalsListFilters): void {
    list.filters.value = next;
}
defineExpose({ filters: list.filters, applyFilters });
</script>

<template>
    <ApprovalsListTable
        :rows="rows"
        :loading="list.loading.value"
        :failed="list.failed.value"
        :total-items="list.totalItems.value"
        :page="list.page.value"
        :page-size="list.pageSize.value"
        :filters="list.filters.value"
        :sort="list.sort.value"
        :managers="list.managers.value"
        :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        @update:filters="list.filters.value = $event"
        @update:sort="list.sort.value = $event"
        @update:page="list.page.value = $event"
        @update:page-size="list.pageSize.value = $event"
        @clear-filters="
            list.filters.value = { ...BLANK_APPROVALS_FILTERS, view: list.filters.value.view }
        "
        @retry="list.reload"
    >
        <template #view-chips>
            <MvFilterChips
                :chips="chips"
                :active="list.filters.value.view"
                @select="selectView"
            />
        </template>
    </ApprovalsListTable>
</template>
