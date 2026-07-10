<script setup lang="ts">
import { computed } from 'vue';
import type { ApprovalRequestDetail, OrderReference, CounterpartyReference } from '../../api/approvals';

const props = defineProps<{
    request: ApprovalRequestDetail;
    orderReference: OrderReference | null;
    counterpartyReference: CounterpartyReference | null;
}>();

const payload = computed<Record<string, unknown>>(() => {
    try {
        return JSON.parse(props.request.payload) as Record<string, unknown>;
    } catch {
        return {};
    }
});

interface DetailRow {
    label: string;
    value: string;
}

const rows = computed<DetailRow[]>(() => {
    const p = payload.value;
    if (props.request.requestType === 'priceAdjustmentApproval') {
        return [
            { label: 'Order', value: props.orderReference?.code ?? `#${p.orderId as string}` },
            { label: 'Customer', value: props.orderReference?.customerName ?? '—' },
            {
                label: 'Requested price',
                value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                    (p.requestedPrice as number) / 100,
                ),
            },
            { label: 'Justification', value: (p.justification as string | null) ?? '—' },
        ];
    }
    if (props.request.requestType === 'discountGrantApproval') {
        return [
            { label: 'Price type', value: p.priceTypeCode as string },
            { label: 'Applies to', value: (p.facetValueCode as string | null) ?? 'All products' },
            { label: 'Discount', value: `${p.percent as number}%` },
            { label: 'Valid from', value: new Date(p.validFrom as string).toLocaleDateString('en-US') },
            { label: 'Valid to', value: new Date(p.validTo as string).toLocaleDateString('en-US') },
            { label: 'Justification', value: (p.requestedByJustification as string | null) ?? '—' },
            ...(p.supersedesDiscountRuleId
                ? [{ label: 'Supersedes', value: `Discount rule #${p.supersedesDiscountRuleId as string}` }]
                : []),
        ];
    }
    // creditTermApproval / creditTermApprovalEscalated
    return [
        { label: 'Customer', value: props.counterpartyReference?.shortName ?? (p.counterpartyErpId as string) },
        { label: 'Extra days requested', value: String(p.requestedExtraDays) },
        ...(p.requestedAmount != null
            ? [
                  {
                      label: 'Amount',
                      value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                          (p.requestedAmount as number) / 100,
                      ),
                  },
              ]
            : []),
        { label: 'Justification', value: (p.justification as string | null) ?? '—' },
    ];
});
</script>

<template>
    <dl class="request-details">
        <div v-for="row in rows" :key="row.label" class="request-details__row">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
        </div>
    </dl>
</template>

<style scoped>
.request-details {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 24px;
    margin: 0;
}

.request-details__row dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--el-text-color-secondary, #6b7280);
    margin-bottom: 2px;
}

.request-details__row dd {
    margin: 0;
    font-size: 14px;
    color: var(--el-text-color-primary, #17212b);
}
</style>
