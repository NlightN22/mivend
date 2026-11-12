<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CustomerCredit, CustomerOrderItem } from '../../api/customers';
import type { CounterpartyOverdue } from '../../api/counterpartyOverdue';
import type { OutstandingBalance } from '../../api/proforma-invoices';
import { useCurrency } from '../../composables/useCurrency';
import { customerKpis } from '../../utils/customerKpis';

const { t } = useI18n();
const props = defineProps<{
    orders: Pick<CustomerOrderItem, 'state' | 'orderPlacedAt' | 'totalWithTax'>[];
    credit: CustomerCredit | null;
    outstanding: OutstandingBalance | null;
    overdue: CounterpartyOverdue | null;
}>();

const { formatWhole, formatMinor } = useCurrency();
const kpis = computed(() => customerKpis(props.orders, props.credit, props.outstanding));

function display(kind: 'minor' | 'whole' | 'count', value: number): string | number {
    if (kind === 'minor') return formatMinor(value);
    return kind === 'whole' ? formatWhole(value) : value;
}
</script>

<template>
    <dl class="customer-summary" data-testid="order-customer-summary">
        <div v-for="kpi in kpis" :key="kpi.key" class="customer-summary__item">
            <dt>{{ kpi.label }}</dt>
            <dd>{{ display(kpi.kind, kpi.value) }}</dd>
        </div>
        <div v-if="overdue" class="customer-summary__item" data-testid="order-summary-overdue">
            <dt>{{ t('orderDetail.summary.overdue') }}</dt>
            <dd :class="{ 'customer-summary__overdue': overdue.amount > 0 }">
                {{ formatMinor(overdue.amount) }}
                <span
                    v-if="overdue.oldestDays !== null && overdue.amount > 0"
                    class="customer-summary__days"
                >
                    {{ t('orderDetail.summary.days', { n: overdue.oldestDays }) }}
                </span>
            </dd>
        </div>
    </dl>
</template>

<style scoped>
.customer-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 10px 20px;
    margin: 0;
    padding: 10px 16px;
    border: 1px solid var(--app-nav-border);
    border-radius: var(--app-radius-md, 12px);
    background: var(--app-surface);
}

.customer-summary__item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.customer-summary dt {
    color: var(--app-text-grey);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.customer-summary__overdue {
    color: var(--app-danger-fg);
}

.customer-summary__days {
    font-size: 12px;
    font-weight: 700;
}

.customer-summary dd {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
}
</style>
