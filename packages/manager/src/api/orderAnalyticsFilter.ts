import type {
    FilterColumn,
    FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';
import { i18n } from '../i18n';
import type { OrderAnalyticsFilterKind } from './generated/graphql';
import { suggestOrderAnalytics, type OrderAnalyticsEntityFilter } from './orderAnalytics';

// The builder column key per entity; the typed name goes to the server, which resolves it inside the viewer's scope.
export const ENTITY_FILTER_KEYS: Record<string, OrderAnalyticsFilterKind> = {
    customer: 'CUSTOMER',
    organization: 'ORGANIZATION',
    pointOfSale: 'POINT_OF_SALE',
    manager: 'MANAGER',
    counterpartyManager: 'COUNTERPARTY_MANAGER',
    product: 'PRODUCT',
    manufacturer: 'MANUFACTURER',
};

export const PRODUCT_FILTER_KEYS = ['product', 'manufacturer'];

export function buildEntityFilterColumns(
    keys: Record<string, OrderAnalyticsFilterKind> = ENTITY_FILTER_KEYS,
    report = 'orders',
): FilterColumn[] {
    return Object.entries(keys).map(([key, kind]) => ({
        key,
        label: i18n.global.t(`analytics.${report}.filters.${key}`),
        type: 'string',
        operators: ['contains'],
        suggest: prefix => suggestOrderAnalytics(kind, prefix),
    }));
}

export function conditionsToEntityFilters(
    conditions: FilterCondition[],
    keys: Record<string, OrderAnalyticsFilterKind> = ENTITY_FILTER_KEYS,
): OrderAnalyticsEntityFilter[] {
    const byKind = new Map<OrderAnalyticsFilterKind, string[]>();
    for (const c of conditions) {
        const kind = keys[c.columnKey];
        const value = typeof c.value === 'string' ? c.value.trim() : '';
        if (!kind || !value) continue;
        byKind.set(kind, [...(byKind.get(kind) ?? []), value]);
    }
    return [...byKind].map(([kind, values]) => ({ kind, values }));
}

export const usesProductFilter = (conditions: FilterCondition[]): boolean =>
    conditions.some(c => PRODUCT_FILTER_KEYS.includes(c.columnKey) && String(c.value).trim());

export const usesCounterpartyManager = (conditions: FilterCondition[]): boolean =>
    conditions.some(c => c.columnKey === 'counterpartyManager' && String(c.value).trim());
