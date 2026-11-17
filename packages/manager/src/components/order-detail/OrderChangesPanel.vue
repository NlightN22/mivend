<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvLineChangeCell, MvPanel, MvStatusBadge } from '@mivend/ui-kit';
import type { LineChangeViewEvent } from '@mivend/ui-kit';
import type { OrderDetail } from '../../api/orderDetail';

const { t, te } = useI18n();
const known = (group: string, key: string): string =>
    te(`orderDetail.changes.${group}.${key}`) ? key : 'other';
const props = defineProps<{ order: OrderDetail }>();

interface ChangedLine {
    id: string;
    sku: string;
    name: string;
    ordered: number;
    actual: number;
    events: LineChangeViewEvent[];
}

const rows = computed<ChangedLine[]>(() =>
    props.order.lines.map(line => {
        const change = props.order.lineChanges.find(c => c.orderLineId === line.id);
        return {
            id: line.id,
            sku: line.productVariant.sku,
            name: line.productVariant.name,
            ordered: change?.ordered ?? line.quantity,
            actual: change?.actual ?? line.quantity,
            events: (change?.events ?? []).map(e => ({
                kind: e.kind,
                title: t(`orderDetail.changes.kinds.${known('kinds', e.titleKey)}`),
                subtitle: t(`orderDetail.changes.subtitles.${known('subtitles', e.subtitleKey)}`),
                quantity: e.quantity,
                remainder: e.remainder,
                reference: t('orderDetail.changes.document', { number: e.documentNumber }),
            })),
        };
    }),
);
</script>

<template>
    <MvPanel v-if="order.lineChanges.length" data-testid="order-changes">
        <div class="order-changes__head">
            <h2 class="order-changes__title">{{ t('orderDetail.changes.title') }}</h2>
            <MvStatusBadge variant="warning">{{ t('orderDetail.changes.badge') }}</MvStatusBadge>
        </div>
        <div class="order-changes__scroll">
            <table class="order-changes__table">
                <thead>
                    <tr>
                        <th>{{ t('orderDetail.changes.sku') }}</th>
                        <th>{{ t('orderDetail.changes.product') }}</th>
                        <th class="order-changes__num">{{ t('orderDetail.changes.ordered') }}</th>
                        <th class="order-changes__num">{{ t('orderDetail.changes.actual') }}</th>
                        <th class="order-changes__num">{{ t('orderDetail.changes.change') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.id">
                        <td class="order-changes__sku">{{ row.sku }}</td>
                        <td>{{ row.name }}</td>
                        <td class="order-changes__num">{{ row.ordered }}</td>
                        <td class="order-changes__num">{{ row.actual }}</td>
                        <td class="order-changes__num">
                            <MvLineChangeCell
                                v-if="row.events.length"
                                :events="row.events"
                                :ordered="row.ordered"
                                :actual="row.actual"
                                :heading="t('orderDetail.changes.heading')"
                                :product-name="row.name"
                                :sku="row.sku"
                                :footer="
                                    t('orderDetail.changes.footer', {
                                        actual: row.actual,
                                        ordered: row.ordered,
                                    })
                                "
                                :info-label="t('orderDetail.changes.info')"
                            />
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </MvPanel>
</template>

<style scoped>
.order-changes__head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}
.order-changes__title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--app-text-deep);
}
.order-changes__scroll {
    overflow-x: auto;
}
.order-changes__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: var(--app-text-body2);
}
.order-changes__table th {
    padding: 8px 10px;
    text-align: left;
    color: var(--app-text-grey);
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--app-nav-border);
}
.order-changes__table td {
    padding: 10px;
    border-bottom: 1px solid var(--app-nav-border);
}
.order-changes__num {
    text-align: right !important;
    white-space: nowrap;
}
.order-changes__sku {
    color: var(--app-text-grey);
    white-space: nowrap;
}
</style>
