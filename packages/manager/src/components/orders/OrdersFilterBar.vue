<script setup lang="ts">
import { MvFilterBar, MvFilterField, MvInput, MvSelect } from '@mivend/ui-kit';
import {
    ORDER_STATE_OPTIONS,
    DATE_RANGE_OPTIONS,
    type OrdersFilters,
    type ManagerOption,
} from '../../api/orders';

defineProps<{ filters: OrdersFilters; managers: ManagerOption[]; showManagerFilter: boolean }>();
const emit = defineEmits<{ 'update:filters': [filters: OrdersFilters]; reset: [] }>();

function update(patch: Partial<OrdersFilters>, filters: OrdersFilters): void {
    emit('update:filters', { ...filters, ...patch });
}
</script>

<template>
    <MvFilterBar @reset="emit('reset')">
        <MvFilterField label="Search">
            <MvInput
                size="sm"
                :model-value="filters.search"
                placeholder="Order number, customer..."
                @update:model-value="update({ search: $event }, filters)"
            />
        </MvFilterField>
        <MvFilterField label="Status">
            <MvSelect
                :model-value="filters.state"
                :options="[...ORDER_STATE_OPTIONS]"
                @update:model-value="update({ state: $event }, filters)"
            />
        </MvFilterField>
        <MvFilterField label="Date range">
            <MvSelect
                :model-value="filters.dateRange"
                :options="[...DATE_RANGE_OPTIONS]"
                @update:model-value="update({ dateRange: $event }, filters)"
            />
        </MvFilterField>
        <MvFilterField v-if="showManagerFilter" label="Manager">
            <MvSelect
                :model-value="filters.managerId"
                :options="[{ value: '', label: 'All managers' }, ...managers.map(m => ({ value: m.id, label: m.name }))]"
                @update:model-value="update({ managerId: $event }, filters)"
            />
        </MvFilterField>
    </MvFilterBar>
</template>
