<script setup lang="ts">
import { MvSidePanel, MvButton, MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import type { OrderListRow } from './ordersListRows';
import OrderDecisionActions from './OrderDecisionActions.vue';

const props = defineProps<{ row: OrderListRow }>();
const emit = defineEmits<{ close: []; open: [code: string]; decided: [] }>();

const FIELDS: { label: string; key: keyof OrderListRow }[] = [
    { label: 'Customer', key: 'customer' },
    { label: 'Manager', key: 'manager' },
    { label: 'Branch', key: 'branch' },
    { label: 'Total', key: 'total' },
    { label: 'Placed by', key: 'placedBy' },
    { label: 'Reservation', key: 'reservation' },
    { label: 'Attention', key: 'attention' },
];

function valueOf(key: keyof OrderListRow): string {
    const value = props.row[key];
    return key === 'placedBy' && props.row.placedByMeta
        ? `${value} (${props.row.placedByMeta})`
        : String(value || '—');
}
</script>

<template>
    <MvSidePanel
        :title="`Order ${formatDocumentNumber(row.code)}`"
        data-testid="order-quick-panel"
        @close="emit('close')"
    >
        <div class="order-quick-panel__badges">
            <MvStatusBadge :variant="row.stateVariant">{{ row.state }}</MvStatusBadge>
            <MvStatusBadge v-for="flag in row.flags" :key="flag.label" :variant="flag.variant">{{
                flag.label
            }}</MvStatusBadge>
        </div>
        <dl class="order-quick-panel__fields">
            <template v-for="field in FIELDS" :key="field.key">
                <dt>{{ field.label }}</dt>
                <dd>{{ valueOf(field.key) }}</dd>
            </template>
            <dt>Customer details</dt>
            <dd>{{ row.customerMeta || '—' }}</dd>
        </dl>
        <OrderDecisionActions :order-id="row.id" @decided="emit('decided')" />
        <template #footer>
            <MvButton variant="ghost" size="sm" @click="emit('close')">Close</MvButton>
            <MvButton size="sm" @click="emit('open', row.code)">Open</MvButton>
        </template>
    </MvSidePanel>
</template>

<style scoped>
.order-quick-panel__badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
}

.order-quick-panel__fields {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 10px 12px;
    margin: 0;
}

.order-quick-panel__fields dt {
    color: var(--app-text-grey);
    font-size: 13px;
}

.order-quick-panel__fields dd {
    margin: 0;
    color: var(--app-nav-text-strong);
    overflow-wrap: anywhere;
}
</style>
