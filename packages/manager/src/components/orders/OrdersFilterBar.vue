<script setup lang="ts">
import { computed } from 'vue';
import { MvTableFilters, type TableFilterFieldDef } from '@mivend/ui-kit';
import {
    ORDER_STATE_OPTIONS,
    ORDER_RESERVATION_STATE_OPTIONS,
    DATE_RANGE_OPTIONS,
    type OrdersFilters,
    type ManagerOption,
} from '../../api/orders';

const props = defineProps<{ filters: OrdersFilters; managers: ManagerOption[]; showManagerFilter: boolean }>();
const emit = defineEmits<{ 'update:filters': [filters: OrdersFilters]; reset: [] }>();

const fields = computed<TableFilterFieldDef[]>(() => {
    const defs: TableFilterFieldDef[] = [
        { key: 'search', label: 'Search', type: 'search', placeholder: 'Order number, customer...' },
        { key: 'state', label: 'Status', type: 'select', options: [...ORDER_STATE_OPTIONS] },
        {
            key: 'reservationState',
            label: 'Reservation',
            type: 'select',
            options: [...ORDER_RESERVATION_STATE_OPTIONS],
        },
        { key: 'dateRange', label: 'Date range', type: 'select', options: [...DATE_RANGE_OPTIONS] },
    ];
    if (props.showManagerFilter) {
        defs.push({
            key: 'managerId',
            label: 'Manager',
            type: 'select',
            options: [{ value: '', label: 'All managers' }, ...props.managers.map(m => ({ value: m.id, label: m.name }))],
        });
    }
    return defs;
});

const filterValues = computed<Record<string, string>>(() => ({ ...props.filters }));

function handleUpdate(value: Record<string, string>): void {
    emit('update:filters', { ...props.filters, ...value } as OrdersFilters);
}
</script>

<template>
    <MvTableFilters :fields="fields" :model-value="filterValues" @update:model-value="handleUpdate" @reset="emit('reset')" />
</template>
