<script setup lang="ts">
import { computed } from 'vue';
import { MvButton } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useActivationCandidates } from '../../composables/useActivationCandidates';
import CounterpartyActivationDataTable from './CounterpartyActivationDataTable.vue';

// Select step of "Activate customers": the counterparty list with its filters and a row selection.
const props = defineProps<{ selectedIds: Set<string> }>();
const emit = defineEmits<{ 'update:selectedIds': [ids: Set<string>] }>();

const list = useActivationCandidates();
const administratorId = useAuthStore().administrator?.id ?? 'anonymous';

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
        <CounterpartyActivationDataTable
            :list="list"
            :selected-ids="selectedIds"
            :administrator-id="administratorId"
            @update:selected-ids="emit('update:selectedIds', $event)"
        >
            <template #toolbar-end>
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
</style>
