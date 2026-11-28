import { UserInputError } from '@vendure/core';

import type { EntityNameFilter } from './order-analytics-entity-filters';
import { MAX_FILTER_VALUES } from './order-metrics.types';
import type { ValueFilters } from './order-metrics.types';

export const VALUE_FILTER_KINDS = ['SHIPMENT_SCHEME', 'ORDER_STATUS'] as const;
export type ValueFilterKind = (typeof VALUE_FILTER_KINDS)[number];

export interface ReportFilter extends Omit<EntityNameFilter, 'kind'> {
    kind: EntityNameFilter['kind'] | ValueFilterKind;
}

export const emptyValueFilters = (): ValueFilters => ({
    shipmentSchemes: [],
    excludeShipmentSchemes: [],
    orderStatuses: [],
    excludeOrderStatuses: [],
});

const isValueKind = (kind: ReportFilter['kind']): kind is ValueFilterKind =>
    (VALUE_FILTER_KINDS as readonly string[]).includes(kind);

// Scheme and status values go to the analytics service exactly as typed; the empty string is a value of its own.
export function splitValueFilters(filters: ReportFilter[]): {
    named: EntityNameFilter[];
    values: ValueFilters;
} {
    const values = emptyValueFilters();
    const named: EntityNameFilter[] = [];
    for (const filter of filters) {
        if (!isValueKind(filter.kind)) {
            named.push(filter as EntityNameFilter);
            continue;
        }
        if (filter.values.length > MAX_FILTER_VALUES) {
            throw new UserInputError(`A filter may hold at most ${MAX_FILTER_VALUES} values`);
        }
        const field =
            filter.kind === 'SHIPMENT_SCHEME'
                ? filter.exclude
                    ? 'excludeShipmentSchemes'
                    : 'shipmentSchemes'
                : filter.exclude
                  ? 'excludeOrderStatuses'
                  : 'orderStatuses';
        values[field].push(...filter.values);
    }
    for (const [name, list] of Object.entries(values)) {
        if (list.length > MAX_FILTER_VALUES) {
            throw new UserInputError(`${name} may hold at most ${MAX_FILTER_VALUES} values`);
        }
    }
    return { named, values };
}
