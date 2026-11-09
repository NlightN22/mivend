<script setup lang="ts">
import { computed } from 'vue';
import { MvButton, MvSelect } from '@mivend/ui-kit';
import type { ActivationCandidatesState } from '../../composables/useActivationCandidates';
import { UNASSIGNED_BRANCH } from './activationColumns';
import { ANY, quickValue, withQuickValue } from './activationQuickFilters';

// Branch and Manager quick filters; they edit the same conditions as the Filter builder.
const props = defineProps<{ list: ActivationCandidatesState }>();

const conditions = computed(() => props.list.filters.value.conditions);
const branchOptions = computed(() => [
    { value: ANY, label: 'All branches' },
    { value: UNASSIGNED_BRANCH, label: 'Unassigned' },
    ...props.list.branches.value.map(b => ({ value: b.id, label: b.name })),
]);
const managerOptions = computed(() => [
    { value: ANY, label: 'All managers' },
    ...props.list.managerOptions.value,
]);
const branch = computed(() => quickValue(conditions.value, 'branch', 'eq'));
const manager = computed(() => quickValue(conditions.value, 'manager', 'contains'));
const dirty = computed(() => conditions.value.length > 0 || props.list.filters.value.search !== '');

function setConditions(next: typeof conditions.value): void {
    props.list.filters.value = { ...props.list.filters.value, conditions: next };
}
function reset(): void {
    props.list.filters.value = { ...props.list.filters.value, search: '', conditions: [] };
}
</script>

<template>
    <div class="activation-quick-filters">
        <div class="activation-quick-filters__select">
            <MvSelect
                :model-value="branch"
                :options="branchOptions"
                aria-label="Branch"
                data-testid="quick-filter-branch"
                @update:model-value="
                    setConditions(withQuickValue(conditions, 'branch', 'eq', $event))
                "
            />
        </div>
        <div class="activation-quick-filters__select">
            <MvSelect
                :model-value="manager"
                :options="managerOptions"
                aria-label="Manager"
                data-testid="quick-filter-manager"
                @update:model-value="
                    setConditions(withQuickValue(conditions, 'manager', 'contains', $event))
                "
            />
        </div>
        <MvButton
            v-if="dirty"
            size="sm"
            variant="ghost"
            data-testid="quick-filter-reset"
            @click="reset"
        >
            Reset
        </MvButton>
    </div>
</template>

<style scoped>
.activation-quick-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.activation-quick-filters__select {
    min-width: 150px;
}

@media (max-width: 800px) {
    .activation-quick-filters__select {
        flex: 1 1 140px;
    }
}
</style>
