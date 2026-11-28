import type {
    FilterColumn,
    FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import { i18n } from '../i18n';
import type { OrderAnalyticsEntityFilter } from './orderAnalytics';
import type { OrderFilterValueOption } from './orderAnalyticsValues';

export type OrderValueFilterKey = 'shipmentScheme' | 'orderStatus';

export const VALUE_FILTER_KINDS = {
    shipmentScheme: 'SHIPMENT_SCHEME',
    orderStatus: 'ORDER_STATUS',
} as const;

// Stands in for the empty source value inside the builder, where an empty option would read as "nothing picked".
export const NOT_SPECIFIED_TOKEN = '<not-specified>';

export type ValueOptions = Partial<Record<OrderValueFilterKey, OrderFilterValueOption[]>>;

export function buildValueFilterColumns(options: ValueOptions): FilterColumn[] {
    const t = i18n.global.t;
    return (Object.keys(VALUE_FILTER_KINDS) as OrderValueFilterKey[])
        .filter(key => (options[key]?.length ?? 0) > 0)
        .map(key => ({
            key,
            label: t(`analytics.orders.filters.${key}`),
            type: 'select' as const,
            operators: ['in' as const, 'notIn' as const],
            options: (options[key] ?? []).map(o => ({
                value: o.value === '' ? NOT_SPECIFIED_TOKEN : o.value,
                label: `${o.value === '' ? t('analytics.orders.filters.notSpecified') : o.value} (${o.orderCount})`,
            })),
        }));
}

// Picked values travel as the exact source text; only the not-specified token becomes the empty string.
export function conditionsToValueFilters(
    conditions: FilterCondition[],
): OrderAnalyticsEntityFilter[] {
    const result: OrderAnalyticsEntityFilter[] = [];
    for (const c of conditions) {
        const kind = VALUE_FILTER_KINDS[c.columnKey as OrderValueFilterKey];
        const exclude = c.operator === 'notIn';
        if (!kind || (c.operator !== 'in' && !exclude)) continue;
        const picked = Array.isArray(c.value) ? c.value : [c.value];
        if (picked.length === 0) continue;
        const values = picked.map(v => (v === NOT_SPECIFIED_TOKEN ? '' : v));
        result.push({ kind, values, ...(exclude ? { exclude } : {}) });
    }
    return result;
}
