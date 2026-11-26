import {
    groupTokenId,
    referenceColumn,
    type FilterColumn,
    type FilterCondition,
} from '@mivend/ui-kit/src/components/MvFilterBuilder/filterLogic';
import { i18n } from '../i18n';
import { suggestAnalyticsGroups, type OrderAnalyticsGroupFilter } from './analyticsGroups';
import type { OrderAnalyticsFilterKind, OrderAnalyticsGroupKind } from './generated/graphql';
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

// Columns whose catalog is a hierarchy: a group pick selects everything below it.
export const ORDER_GROUP_KEYS: Record<string, OrderAnalyticsGroupKind> = {
    customer: 'CUSTOMER_GROUP',
    product: 'PRODUCT_CATEGORY',
    manufacturer: 'MANUFACTURER_GROUP',
};

export const SALES_GROUP_KEYS: Record<string, OrderAnalyticsGroupKind> = {
    customer: 'CUSTOMER_GROUP',
};

export const PRODUCT_FILTER_KEYS = ['product', 'manufacturer'];

export function buildEntityFilterColumns(
    keys: Record<string, OrderAnalyticsFilterKind> = ENTITY_FILTER_KEYS,
    report = 'orders',
    offeredGroups: OrderAnalyticsGroupKind[] = [],
    groupKeys: Record<string, OrderAnalyticsGroupKind> = ORDER_GROUP_KEYS,
): FilterColumn[] {
    return Object.entries(keys).map(([key, kind]) => {
        const groupKind = groupKeys[key];
        return referenceColumn({
            key,
            label: i18n.global.t(`analytics.${report}.filters.${key}`),
            lookup: prefix => suggestOrderAnalytics(kind, prefix),
            exclude: true,
            groups:
                groupKind && offeredGroups.includes(groupKind)
                    ? { lookup: prefix => suggestAnalyticsGroups(groupKind, prefix) }
                    : undefined,
        });
    });
}

const valuesOf = (c: FilterCondition): string[] =>
    (Array.isArray(c.value) ? c.value : [c.value]).map(v => v.trim()).filter(Boolean);

// Typed names stay a substring match; picked ones (and every exclusion) are whole names.
export function conditionsToEntityFilters(
    conditions: FilterCondition[],
    keys: Record<string, OrderAnalyticsFilterKind> = ENTITY_FILTER_KEYS,
): OrderAnalyticsEntityFilter[] {
    const groups = new Map<string, OrderAnalyticsEntityFilter>();
    for (const c of conditions) {
        const kind = keys[c.columnKey];
        const values = valuesOf(c);
        const exclude = c.operator === 'notIn';
        const exact = c.operator === 'in' || exclude;
        if (!kind || values.length === 0 || (c.operator !== 'contains' && !exact)) continue;
        const id = `${kind}:${exact}:${exclude}`;
        const group = groups.get(id) ?? {
            kind,
            values: [],
            exact,
            ...(exclude ? { exclude } : {}),
        };
        group.values.push(...values);
        groups.set(id, group);
    }
    return [...groups.values()];
}

export function conditionsToGroupFilters(
    conditions: FilterCondition[],
    groupKeys: Record<string, OrderAnalyticsGroupKind> = ORDER_GROUP_KEYS,
): OrderAnalyticsGroupFilter[] {
    const groups = new Map<string, OrderAnalyticsGroupFilter>();
    for (const c of conditions) {
        const kind = groupKeys[c.columnKey];
        const exclude = c.operator === 'notInGroup';
        if (!kind || (c.operator !== 'inGroup' && !exclude)) continue;
        const ids = valuesOf(c).map(groupTokenId).filter(Boolean);
        if (ids.length === 0) continue;
        const id = `${kind}:${exclude}`;
        const group = groups.get(id) ?? { kind, ids: [], ...(exclude ? { exclude } : {}) };
        group.ids.push(...ids);
        groups.set(id, group);
    }
    return [...groups.values()];
}

// Product, manufacturer, category and their exclusions all total the matching order lines.
export const usesProductFilter = (conditions: FilterCondition[]): boolean =>
    conditions.some(c => PRODUCT_FILTER_KEYS.includes(c.columnKey) && valuesOf(c).length > 0);

export const usesCounterpartyManager = (conditions: FilterCondition[]): boolean =>
    conditions.some(c => c.columnKey === 'counterpartyManager' && valuesOf(c).length > 0);
