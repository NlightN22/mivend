<script setup lang="ts">
import { computed, watch } from 'vue';
import { MvButton, MvNotice } from '@mivend/ui-kit';
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
const label = computed(() => (matching.value ? `All ${matching.value.total} selected` : undefined));

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
            <template #selection-actions>
                <MvButton
                    v-if="canOfferAll && !overCap"
                    size="sm"
                    variant="secondary"
                    data-testid="select-all-matching"
                    @click="selectAll"
                >
                    Select all {{ total }} matching the filter
                </MvButton>
                <span
                    v-else-if="canOfferAll"
                    class="activation-select-step__cap"
                    data-testid="select-all-capped"
                >
                    {{ total }} match; at most {{ maxRecords }} per batch, narrow the filter
                </span>
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

.activation-select-step__cap {
    font-size: 13px;
    color: var(--el-text-color-secondary);
}
</style>
