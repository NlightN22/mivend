<script setup lang="ts">
import { computed } from 'vue';
import { MvButton, MvNotice } from '@mivend/ui-kit';
import { useActivationCandidates } from '../../composables/useActivationCandidates';
import CounterpartyActivationDataTable from './CounterpartyActivationDataTable.vue';

// Select step of "Activate customers": the counterparty list with its filters and a row selection.
const props = defineProps<{ selectedIds: Set<string> }>();
const emit = defineEmits<{ 'update:selectedIds': [ids: Set<string>] }>();

const list = useActivationCandidates();

const pageIds = computed(() => list.items.value.map(c => c.id));
const pageFullySelected = computed(
    () => pageIds.value.length > 0 && pageIds.value.every(id => props.selectedIds.has(id)),
);

function selectPage(): void {
    emit('update:selectedIds', new Set([...props.selectedIds, ...pageIds.value]));
}
function clearSelection(): void {
    emit('update:selectedIds', new Set());
}
</script>

<template>
    <div class="activation-select-step">
        <MvNotice v-if="list.error.value" variant="error">{{ list.error.value }}</MvNotice>
        <CounterpartyActivationDataTable
            :items="list.items.value"
            :loading="list.loading.value"
            :total-items="list.totalItems.value"
            :page="list.page.value"
            :page-size="list.pageSize.value"
            :filters="list.filters.value"
            :status-filter="list.statusFilter.value"
            :branch-options="list.branches.value"
            :readiness-counts="list.readinessCounts.value"
            :selected-ids="selectedIds"
            :manager-name="list.managerName"
            :branch-name="list.branchName"
            @update:filters="list.filters.value = $event"
            @update:status-filter="list.statusFilter.value = $event"
            @update:page="list.page.value = $event"
            @update:page-size="list.pageSize.value = $event"
            @update:sort="list.sort.value = $event"
            @update:selected-ids="emit('update:selectedIds', $event)"
        >
            <template #toolbar-end>
                <span class="activation-select-step__count" aria-live="polite">
                    Selected: {{ selectedIds.size }}
                </span>
                <MvButton
                    size="sm"
                    variant="secondary"
                    :disabled="!pageIds.length || pageFullySelected"
                    @click="selectPage"
                >
                    Select all ({{ pageIds.length }})
                </MvButton>
                <MvButton
                    size="sm"
                    variant="ghost"
                    :disabled="!selectedIds.size"
                    @click="clearSelection"
                >
                    Clear
                </MvButton>
            </template>
        </CounterpartyActivationDataTable>
    </div>
</template>

<style scoped>
.activation-select-step {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}

.activation-select-step__count {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    white-space: nowrap;
}
</style>
