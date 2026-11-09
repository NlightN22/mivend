<script setup lang="ts">
import { computed, watch } from 'vue';
import { MvNotice } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useActivationCandidates } from '../../composables/useActivationCandidates';
import { conditionsToCounterpartyFilter, readinessOfView } from '../../api/activationFilter';
import {
    changeRows,
    criteriaChanged,
    selectAllMatching,
    tickedIds,
    type BulkSelection,
} from './bulkSelection';
import CounterpartyActivationDataTable from './CounterpartyActivationDataTable.vue';

// Select step of "Activate customers": the counterparty list with its filters and a row selection.
const props = defineProps<{ selection: BulkSelection; maxRecords: number }>();
const emit = defineEmits<{ 'update:selection': [selection: BulkSelection] }>();

const list = useActivationCandidates();
const administratorId = useAuthStore().administrator?.id ?? 'anonymous';

const pageIds = computed(() => list.items.value.map(c => c.id));
const ticked = computed(() => tickedIds(props.selection, pageIds.value));
const matching = computed(() => props.selection.matching);
const total = computed(() => list.totalItems.value);

// The same three inputs the list query is built from; the server resolves the ids itself.
const criteria = computed<Record<string, unknown>>(() => {
    const { search, view, conditions } = list.filters.value;
    return {
        ...(search ? { search } : {}),
        ...(readinessOfView(view) ? { readiness: readinessOfView(view) } : {}),
        filter: conditionsToCounterpartyFilter(conditions),
    };
});

const pageFullySelected = computed(
    () => pageIds.value.length > 0 && pageIds.value.every(id => props.selection.ids.has(id)),
);
const overCap = computed(() => total.value > props.maxRecords);
const canOfferAll = computed(
    () => !matching.value && pageFullySelected.value && total.value > props.selection.ids.size,
);
const label = computed(() =>
    matching.value
        ? `All ${matching.value.total} selected`
        : `Selected ${props.selection.ids.size} of ${total.value}`,
);

watch(criteria, value => {
    const next = criteriaChanged(props.selection, value);
    if (next !== props.selection) emit('update:selection', next);
});

function onRows(next: Set<string>): void {
    emit('update:selection', changeRows(props.selection, next, pageIds.value));
}
function selectAll(): void {
    emit('update:selection', selectAllMatching(props.selection, total.value, criteria.value));
}
</script>

<template>
    <div class="activation-select-step">
        <MvNotice v-if="selection.notice" variant="warning">{{ selection.notice }}</MvNotice>
        <CounterpartyActivationDataTable
            :list="list"
            :selected-ids="ticked"
            :selection-label="label"
            :administrator-id="administratorId"
            @update:selected-ids="onRows"
        >
            <template #below-toolbar>
                <MvNotice v-if="overCap" variant="warning" data-testid="select-over-cap">
                    {{ total }} match; at most {{ maxRecords }} can be processed in one batch.
                    Narrow the filter (for example by branch, manager or readiness).
                </MvNotice>
            </template>
            <template #selection-actions>
                <button
                    v-if="canOfferAll && !overCap"
                    type="button"
                    class="activation-select-step__link"
                    data-testid="select-all-matching"
                    @click="selectAll"
                >
                    Select all {{ total }} records
                </button>
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

.activation-select-step__link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--el-color-primary);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
}

.activation-select-step__link:hover {
    color: var(--el-color-primary-dark-2);
    text-decoration: underline;
}

.activation-select-step__link:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: 2px;
    border-radius: 2px;
}
</style>
