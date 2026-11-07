<script setup lang="ts">
import { computed } from 'vue';
import { MvKpiCard, MvKpiCarousel } from '@mivend/ui-kit';
import type { CustomerCredit, CustomerOrderItem } from '../../api/customers';
import type { OutstandingBalance } from '../../api/proforma-invoices';
import { useCurrency } from '../../composables/useCurrency';
import { customerKpis } from '../../utils/customerKpis';

const props = defineProps<{
    orders: Pick<CustomerOrderItem, 'state' | 'orderPlacedAt' | 'totalWithTax'>[];
    credit: CustomerCredit | null;
    outstanding: OutstandingBalance | null;
}>();

const { formatWhole, formatMinor } = useCurrency();
const kpis = computed(() => customerKpis(props.orders, props.credit, props.outstanding));

function display(kind: 'minor' | 'whole' | 'count', value: number): string | number {
    if (kind === 'minor') return formatMinor(value);
    return kind === 'whole' ? formatWhole(value) : value;
}
</script>

<template>
    <MvKpiCarousel class="customer-kpis">
        <MvKpiCard
            v-for="kpi in kpis"
            :key="kpi.key"
            :label="kpi.label"
            :value="display(kpi.kind, kpi.value)"
        />
    </MvKpiCarousel>
</template>
