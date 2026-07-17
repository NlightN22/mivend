<script setup lang="ts">
import { computed } from 'vue';
import { MvTableFilters, type TableFilterFieldDef } from '@mivend/ui-kit';
import { INVOICE_STATUS_OPTIONS, type InvoiceFilters } from '../../api/invoices';

const props = defineProps<{ filters: InvoiceFilters }>();
const emit = defineEmits<{ 'update:filters': [filters: InvoiceFilters]; reset: [] }>();

const fields = computed<TableFilterFieldDef[]>(() => [
    { key: 'status', label: 'Status', type: 'select', options: [...INVOICE_STATUS_OPTIONS] },
]);

const filterValues = computed<Record<string, string>>(() => ({ ...props.filters }));

function handleUpdate(value: Record<string, string>): void {
    emit('update:filters', { ...props.filters, ...value } as InvoiceFilters);
}
</script>

<template>
    <MvTableFilters :fields="fields" :model-value="filterValues" @update:model-value="handleUpdate" @reset="emit('reset')" />
</template>
