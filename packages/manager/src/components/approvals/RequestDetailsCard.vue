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

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

const orderLine = computed(() => {
    if (props.request.requestType !== 'priceAdjustmentApproval') return null;
    const orderLineId = payload.value.orderLineId as string | undefined;
    return props.orderReference?.lines.find(l => l.id === orderLineId) ?? null;
});

const priceDeltaPercent = computed<number | null>(() => {
    const line = orderLine.value;
    const requestedPrice = payload.value.requestedPrice as number | undefined;
    if (!line || requestedPrice == null || line.unitPriceWithTax === 0) return null;
    return ((requestedPrice - line.unitPriceWithTax) / line.unitPriceWithTax) * 100;
});

const rows = computed<DetailRow[]>(() => {
    const p = payload.value;
    if (props.request.requestType === 'priceAdjustmentApproval') {
        return [
            { label: 'Order', value: props.orderReference?.code ?? `#${p.orderId as string}` },
            { label: 'Customer', value: props.orderReference?.customerName ?? '—' },
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
    <div v-if="orderLine" class="request-details__line">
        <div class="request-details__line-product">
            <div class="request-details__line-name">{{ orderLine.productName }}</div>
            <div class="request-details__line-sku">{{ orderLine.sku }} · qty {{ orderLine.quantity }}</div>
        </div>
        <div class="request-details__line-prices">
            <span class="request-details__line-original">{{ money(orderLine.unitPriceWithTax) }}</span>
            <span>→</span>
            <span class="request-details__line-requested">{{ money(payload.requestedPrice as number) }}</span>
            <span
                v-if="priceDeltaPercent !== null"
                class="request-details__line-delta"
                :class="{ 'request-details__line-delta--negative': priceDeltaPercent < 0 }"
            >
                {{ priceDeltaPercent > 0 ? '+' : '' }}{{ priceDeltaPercent.toFixed(1) }}%
            </span>
        </div>
    </div>

    <dl class="request-details">
        <div v-for="row in rows" :key="row.label" class="request-details__row">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
        </div>
    </dl>
</template>

<style scoped>
.request-details__line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
}

.request-details__line-name {
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}

.request-details__line-sku {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
    margin-top: 2px;
}

.request-details__line-prices {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    white-space: nowrap;
}

.request-details__line-original {
    color: var(--el-text-color-secondary, #6b7280);
    text-decoration: line-through;
}

.request-details__line-delta {
    padding: 2px 8px;
    border-radius: 999px;
    background: #d1fae5;
    color: #047857;
    font-size: 12px;
}

.request-details__line-delta--negative {
    background: #fee2e2;
    color: #dc2626;
}

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
