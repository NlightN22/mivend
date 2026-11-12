<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvButton, MvSelect } from '@mivend/ui-kit';
import type { ActivationCandidatesState } from '../../composables/useActivationCandidates';
import { UNASSIGNED_BRANCH } from './activationColumns';
import { ANY, quickValue, withQuickValue } from './activationQuickFilters';

// Branch and Manager quick filters; they edit the same conditions as the Filter builder.
const props = defineProps<{ list: ActivationCandidatesState }>();
const { t } = useI18n();

const conditions = computed(() => props.list.filters.value.conditions);
const branchOptions = computed(() => [
    { value: ANY, label: t('bulkOperations.activation.allBranches') },
    { value: UNASSIGNED_BRANCH, label: t('bulkOperations.activation.unassigned') },
    ...props.list.branches.value.map(b => ({ value: b.id, label: b.name })),
]);
const managerOptions = computed(() => [
    { value: ANY, label: t('bulkOperations.activation.allManagers') },
    ...props.list.managerOptions.value,
]);
const branch = computed(() => quickValue(conditions.value, 'branch', 'eq'));
const manager = computed(() => quickValue(conditions.value, 'manager', 'eq'));
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
                :aria-label="t('bulkOperations.activation.branch')"
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
                :aria-label="t('bulkOperations.activation.manager')"
                data-testid="quick-filter-manager"
                @update:model-value="
                    setConditions(withQuickValue(conditions, 'manager', 'eq', $event))
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
            {{ t('bulkOperations.activation.reset') }}
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
    .activation-quick-filters {
        flex: 1 1 100%;
        flex-wrap: nowrap;
        min-width: 0;
    }

    .activation-quick-filters__select {
        flex: 1 1 0;
        min-width: 0;
    }
}
</style>
