<script setup lang="ts">
import { computed } from 'vue';
import { MvButton, MvDateField, MvFormField, MvInput, MvSelect } from '@mivend/ui-kit';
import type { ManagerOption } from '../../api/orders';
import type { ChangeJournalUrlFilters } from '../../utils/changeJournalFilter';
import {
    ACTOR_TYPE_LABELS,
    CHANGE_JOURNAL_LABELS as L,
    ENTITY_TYPE_LABELS,
} from './changeJournalLabels';

const props = defineProps<{ modelValue: ChangeJournalUrlFilters; managers: ManagerOption[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: ChangeJournalUrlFilters]; reset: [] }>();

const actorOptions = computed(() => [
    { value: '', label: L.anyOption },
    ...Object.entries(ACTOR_TYPE_LABELS).map(([value, label]) => ({ value, label })),
]);
const adminOptions = computed(() => [
    { value: '', label: L.anyOption },
    ...props.managers.map(m => ({ value: m.id, label: m.name })),
]);
const entityTypes = computed(() => Object.entries(ENTITY_TYPE_LABELS));

function set(key: keyof ChangeJournalUrlFilters, value: string): void {
    emit('update:modelValue', { ...props.modelValue, [key]: value });
}
</script>

<template>
    <div class="change-journal-filters">
        <MvFormField :label="L.filterEntityType">
            <MvInput
                :model-value="modelValue.entityType"
                list="change-journal-entity-types"
                placeholder="TradingPoint"
                @update:model-value="set('entityType', $event)"
            />
            <datalist id="change-journal-entity-types">
                <option v-for="[value, label] in entityTypes" :key="value" :value="value">
                    {{ label }}
                </option>
            </datalist>
        </MvFormField>
        <MvFormField :label="L.filterActorType">
            <MvSelect
                :model-value="modelValue.actorType"
                :options="actorOptions"
                @update:model-value="set('actorType', $event)"
            />
        </MvFormField>
        <MvFormField :label="L.filterUser">
            <MvInput
                :model-value="modelValue.userId"
                inputmode="numeric"
                @update:model-value="set('userId', $event)"
            />
        </MvFormField>
        <MvFormField :label="L.filterAdministrator">
            <MvSelect
                :model-value="modelValue.administratorId"
                :options="adminOptions"
                @update:model-value="set('administratorId', $event)"
            />
        </MvFormField>
        <MvFormField :label="L.filterFrom">
            <MvDateField :model-value="modelValue.from" @update:model-value="set('from', $event)" />
        </MvFormField>
        <MvFormField :label="L.filterTo">
            <MvDateField :model-value="modelValue.to" @update:model-value="set('to', $event)" />
        </MvFormField>
        <div class="change-journal-filters__reset">
            <MvButton size="sm" variant="ghost" @click="emit('reset')">{{
                L.resetFilters
            }}</MvButton>
        </div>
    </div>
</template>

<style scoped>
.change-journal-filters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
    gap: 12px;
    align-items: end;
}
</style>
