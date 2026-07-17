<script setup lang="ts">
import { computed } from 'vue';
import { MvTableFilters, type TableFilterFieldDef } from '@mivend/ui-kit';
import { PAYMENT_STATUS_OPTIONS, PAYMENT_CHANNEL_OPTIONS, type PaymentFilters } from '../../api/payments';

const props = defineProps<{ filters: PaymentFilters }>();
const emit = defineEmits<{ 'update:filters': [filters: PaymentFilters]; reset: [] }>();

const fields = computed<TableFilterFieldDef[]>(() => [
    { key: 'status', label: 'Status', type: 'select', options: [...PAYMENT_STATUS_OPTIONS] },
    { key: 'channel', label: 'Source', type: 'select', options: [...PAYMENT_CHANNEL_OPTIONS] },
]);

const filterValues = computed<Record<string, string>>(() => ({ ...props.filters }));

function handleUpdate(value: Record<string, string>): void {
    emit('update:filters', { ...props.filters, ...value } as PaymentFilters);
}
</script>

<template>
    <MvTableFilters :fields="fields" :model-value="filterValues" @update:model-value="handleUpdate" @reset="emit('reset')" />
</template>
