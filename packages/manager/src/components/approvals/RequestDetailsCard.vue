<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCurrency } from '../../composables/useCurrency';
import type {
    ApprovalRequestDetail,
    OrderReference,
    CounterpartyReference,
} from '../../api/approvals';

const { t } = useI18n();

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

const { formatMinorExact: money } = useCurrency();

const orderLine = computed(() => {
    if (props.request.requestType !== 'priceAdjustmentApproval') return null;
    const orderLineId = payload.value.orderLineId as string | undefined;
    return props.orderReference?.lines.find(l => l.id === orderLineId) ?? null;
});

const priceDeltaPercent = computed<number | null>(() => {
    const line = orderLine.value;
    const requestedPrice = payload.value.requestedPrice as number | undefined;
    if (!line || requestedPrice == null || line.discountedUnitPriceWithTax === 0) return null;
    return (
        ((requestedPrice - line.discountedUnitPriceWithTax) / line.discountedUnitPriceWithTax) * 100
    );
});

const stepRows = computed<DetailRow[]>(() => {
    const r = props.request;
    if (r.status !== 'pending') return [];
    const step = r.steps.find(s => s.stepIndex === r.currentStepIndex);
    return [
        {
            label: t('approvals.details.currentStep'),
            value: t('approvals.details.currentStepValue', {
                n: r.currentStepIndex + 1,
                total: r.totalSteps,
                role: r.currentStepRole ?? '—',
            }),
        },
        ...(step?.wasEscalated
            ? [
                  {
                      label: t('approvals.details.escalated'),
                      value: t('approvals.details.escalatedValue'),
                  },
              ]
            : []),
    ];
});

const rows = computed<DetailRow[]>(() => {
    const p = payload.value;
    if (props.request.requestType === 'priceAdjustmentApproval') {
        return [
            {
                label: t('approvals.details.order'),
                value: props.orderReference?.code ?? `#${p.orderId as string}`,
            },
            {
                label: t('approvals.details.customer'),
                value: props.orderReference?.customerName ?? '—',
            },
            {
                label: t('approvals.details.justification'),
                value: (p.justification as string | null) ?? '—',
            },
        ];
    }
    if (props.request.requestType === 'discountGrantApproval') {
        return [
            { label: t('approvals.details.priceType'), value: p.priceTypeCode as string },
            {
                label: t('approvals.details.appliesTo'),
                value: (p.facetValueCode as string | null) ?? t('approvals.details.allProducts'),
            },
            { label: t('approvals.details.discount'), value: `${p.percent as number}%` },
            {
                label: t('approvals.details.validFrom'),
                value: formatDate(p.validFrom as string),
            },
            { label: t('approvals.details.validTo'), value: formatDate(p.validTo as string) },
            {
                label: t('approvals.details.justification'),
                value: (p.requestedByJustification as string | null) ?? '—',
            },
            ...(p.supersedesDiscountRuleId
                ? [
                      {
                          label: t('approvals.details.supersedes'),
                          value: t('approvals.details.supersedesValue', {
                              id: p.supersedesDiscountRuleId as string,
                          }),
                      },
                  ]
                : []),
        ];
    }
    // creditTermApproval / creditTermApprovalEscalated
    return [
        {
            label: t('approvals.details.customer'),
            value: props.counterpartyReference?.shortName ?? (p.counterpartyErpId as string),
        },
        { label: t('approvals.details.extraDays'), value: String(p.requestedExtraDays) },
        ...(p.requestedAmount != null
            ? [
                  {
                      label: t('approvals.details.amount'),
                      value: money(p.requestedAmount as number),
                  },
              ]
            : []),
        {
            label: t('approvals.details.justification'),
            value: (p.justification as string | null) ?? '—',
        },
    ];
});
</script>

<template>
    <div v-if="orderLine" class="request-details__line">
        <div class="request-details__line-product">
            <div class="request-details__line-name">{{ orderLine.productName }}</div>
            <div class="request-details__line-sku">
                {{ orderLine.sku }} ·
                {{ t('approvals.details.quantity', { n: orderLine.quantity }) }}
            </div>
        </div>
        <div class="request-details__line-prices">
            <span class="request-details__line-original">{{
                money(orderLine.discountedUnitPriceWithTax)
            }}</span>
            <span>→</span>
            <span class="request-details__line-requested">{{
                money(payload.requestedPrice as number)
            }}</span>
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
        <div v-for="row in [...rows, ...stepRows]" :key="row.label" class="request-details__row">
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
    border-bottom: 1px solid var(--app-row-border);
}

.request-details__line-name {
    font-weight: 700;
    color: var(--app-text-deep);
}

.request-details__line-sku {
    font-size: 12px;
    color: var(--app-text-grey);
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
    color: var(--app-text-grey);
    text-decoration: line-through;
}

.request-details__line-delta {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--app-ok-bg);
    color: var(--app-ok-fg);
    font-size: 12px;
}

.request-details__line-delta--negative {
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
}

.request-details {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 24px;
    margin: 0;
}

@media (max-width: 600px) {
    .request-details {
        grid-template-columns: 1fr;
    }

    .request-details__line {
        flex-direction: column;
        align-items: flex-start;
    }
}

.request-details__row dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
    color: var(--app-text-grey);
    margin-bottom: 2px;
}

.request-details__row dd {
    margin: 0;
    font-size: 14px;
    color: var(--app-text-deep);
}
</style>
