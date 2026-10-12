<script setup lang="ts">
import { computed } from 'vue';
import { MvTableFilters, type TableFilterFieldDef } from '@mivend/ui-kit';
import {
    PROFORMA_INVOICE_STATUS_OPTIONS,
    type ProformaInvoiceFilters,
} from '../../api/proforma-invoices';

const props = defineProps<{ filters: ProformaInvoiceFilters }>();
const emit = defineEmits<{ 'update:filters': [filters: ProformaInvoiceFilters]; reset: [] }>();

const fields = computed<TableFilterFieldDef[]>(() => [
    {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [...PROFORMA_INVOICE_STATUS_OPTIONS],
    },
]);

const filterValues = computed<Record<string, string>>(() => ({ ...props.filters }));

function handleUpdate(value: Record<string, string>): void {
    emit('update:filters', { ...props.filters, ...value } as ProformaInvoiceFilters);
}
</script>

<template>
    <MvTableFilters
        :fields="fields"
        :model-value="filterValues"
        @update:model-value="handleUpdate"
        @reset="emit('reset')"
    />
</template>
