import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, UserInputError } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import { loggerCtx } from '../types';
import { resolveEntityFilters } from './order-analytics-entity-filters';
import type { EntityNameFilter } from './order-analytics-entity-filters';
import { OrderAnalyticsEntityNamesService } from './order-analytics-entity-names.service';
import { OrderAnalyticsLabelsService } from './order-analytics-labels.service';
import { OrderAnalyticsScopeService } from './order-analytics-scope.service';
import { OrderMetricsClient } from './order-metrics.client';
import { MAX_FILTER_VALUES, OrderMetricsError } from './order-metrics.types';
import type {
    OrderDimension,
    OrderGranularity,
    OrderMetricsFilters,
    OrderTurnoverRow,
} from './order-metrics.types';
import { mergeTurnoverRows } from './order-turnover-merge';

export type OrderAnalyticsState = 'OK' | 'NOT_CONFIGURED' | 'TOO_LARGE' | 'UNAVAILABLE';

export interface OrderAnalyticsInput extends Partial<OrderMetricsFilters> {
    mainManagerOnly?: boolean | null;
    // Names typed in the filter builder; resolved to ERP ids here, inside the viewer's scope.
    entityFilters?: EntityNameFilter[] | null;
    // mivend ids of an embedding card; resolved to ERP ids here, inside the viewer's scope.
    counterpartyId?: string | null;
    administratorId?: string | null;
    from: Date;
    to: Date;
    granularity: OrderGranularity;
    dimension: OrderDimension;
    timeZone?: string | null;
}

export interface OrderAnalyticsRow extends OrderTurnoverRow {
    label: string;
}

export interface OrderAnalyticsResult {
    state: OrderAnalyticsState;
    rows: OrderAnalyticsRow[];
    limitedToVisibleCustomers: boolean;
}

const intersect = (requested: string[], visible: string[]): string[] => {
    const allowed = new Set(visible);
    return requested.filter(id => allowed.has(id));
};

const chunk = <T>(items: T[], size: number): T[][] => {
    const parts: T[][] = [];
    for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
    return parts;
};

const MANAGER_DIMENSIONS: OrderDimension[] = ['MANAGER', 'COUNTERPARTY_MANAGER'];

const STATE_BY_ERROR: Record<string, OrderAnalyticsState> = {
    NOT_CONFIGURED: 'NOT_CONFIGURED',
    TOO_LARGE: 'TOO_LARGE',
};

@Injectable()
export class OrderAnalyticsService {
    constructor(
        private readonly client: OrderMetricsClient,
        private readonly scope: OrderAnalyticsScopeService,
        private readonly labels: OrderAnalyticsLabelsService,
        private readonly entityNames: OrderAnalyticsEntityNamesService,
    ) {}

    async query(ctx: RequestContext, input: OrderAnalyticsInput): Promise<OrderAnalyticsResult> {
        const filters = this.requestedFilters(input);
        try {
            const pinned = await this.pinnedEntities(ctx, input);
            if (pinned === 'unresolved') {
                return { state: 'OK', rows: [], limitedToVisibleCustomers: true };
            }
            if (input.entityFilters?.some(f => f.kind === 'CONTRACT')) {
                throw new UserInputError('Orders cannot be filtered by contract');
            }
            const named = await resolveEntityFilters(
                ctx,
                this.entityNames,
                input.entityFilters ?? [],
            );
            if (named.unmatched) return { state: 'OK', rows: [], limitedToVisibleCustomers: true };
            for (const key of Object.keys(filters) as Array<keyof OrderMetricsFilters>) {
                filters[key] = [...filters[key], ...named[key]];
            }
            filters.customerIds = [...filters.customerIds, ...pinned.customerIds];
            filters.managerIds = [...filters.managerIds, ...pinned.managerIds];
            const [visibleCustomers, visibleManagers] = await Promise.all([
                this.scope.visibleCustomerErpIds(ctx),
                this.scope.visibleManagerErpIds(ctx),
            ]);
            const limited = visibleCustomers !== null;
            const customerIds =
                visibleCustomers === null
                    ? filters.customerIds
                    : filters.customerIds.length
                      ? intersect(filters.customerIds, visibleCustomers)
                      : visibleCustomers;
            const managerIds =
                visibleManagers !== null && filters.managerIds.length
                    ? intersect(filters.managerIds, visibleManagers)
                    : filters.managerIds;
            const counterpartyManagerIds =
                visibleManagers !== null && filters.counterpartyManagerIds.length
                    ? intersect(filters.counterpartyManagerIds, visibleManagers)
                    : filters.counterpartyManagerIds;
            const nothingVisible =
                (limited && customerIds.length === 0) ||
                (visibleManagers !== null &&
                    ((filters.managerIds.length > 0 && managerIds.length === 0) ||
                        (filters.counterpartyManagerIds.length > 0 &&
                            counterpartyManagerIds.length === 0)));
            if (nothingVisible)
                return { state: 'OK', rows: [], limitedToVisibleCustomers: limited };

            const fetched: OrderTurnoverRow[] = [];
            const parts = chunk(customerIds, MAX_FILTER_VALUES);
            for (const customers of parts.length ? parts : [[]]) {
                fetched.push(
                    ...(await this.client.getOrderTurnover({
                        from: input.from,
                        to: input.to,
                        granularity: input.granularity,
                        dimension: input.dimension,
                        timeZone: input.timeZone ?? '',
                        mainManagerOnly: input.mainManagerOnly ?? false,
                        ...filters,
                        customerIds: customers,
                        managerIds,
                        counterpartyManagerIds,
                    })),
                );
            }
            const visibleRows =
                MANAGER_DIMENSIONS.includes(input.dimension) && visibleManagers !== null
                    ? fetched.filter(r => visibleManagers.includes(r.dimensionId))
                    : fetched;
            const rows = mergeTurnoverRows(visibleRows);
            const names = await this.labels.labelsFor(ctx, input.dimension, [
                ...new Set(rows.map(r => r.dimensionId).filter(Boolean)),
            ]);
            return {
                state: 'OK',
                rows: rows.map(r => ({ ...r, label: names.get(r.dimensionId) ?? r.dimensionId })),
                limitedToVisibleCustomers: limited,
            };
        } catch (error) {
            return this.failure(error);
        }
    }

    // A pinned entity that is missing, hidden or without an ERP id has no orders to show, never an unfiltered answer.
    private async pinnedEntities(
        ctx: RequestContext,
        input: OrderAnalyticsInput,
    ): Promise<{ customerIds: string[]; managerIds: string[] } | 'unresolved'> {
        const customerIds: string[] = [];
        const managerIds: string[] = [];
        if (input.counterpartyId) {
            const erpId = await this.scope.customerErpIdFor(ctx, input.counterpartyId);
            if (!erpId) return 'unresolved';
            customerIds.push(erpId);
        }
        if (input.administratorId) {
            const erpId = await this.scope.managerErpIdFor(ctx, input.administratorId);
            if (!erpId) return 'unresolved';
            managerIds.push(erpId);
        }
        return { customerIds, managerIds };
    }

    private requestedFilters(input: OrderAnalyticsInput): OrderMetricsFilters {
        const filters: OrderMetricsFilters = {
            customerIds: input.customerIds ?? [],
            organizationIds: input.organizationIds ?? [],
            pointOfSaleIds: input.pointOfSaleIds ?? [],
            managerIds: input.managerIds ?? [],
            counterpartyManagerIds: input.counterpartyManagerIds ?? [],
            productIds: input.productIds ?? [],
            manufacturerIds: input.manufacturerIds ?? [],
        };
        for (const [name, ids] of Object.entries(filters)) {
            if (ids.length > MAX_FILTER_VALUES) {
                throw new UserInputError(`${name} may hold at most ${MAX_FILTER_VALUES} values`);
            }
        }
        return filters;
    }

    private failure(error: unknown): OrderAnalyticsResult {
        const empty = { rows: [], limitedToVisibleCustomers: false };
        if (error instanceof QueryTooLargeError) return { state: 'TOO_LARGE', ...empty };
        if (error instanceof OrderMetricsError) {
            if (error.kind === 'INVALID_ARGUMENT') throw new UserInputError(error.message);
            const state = STATE_BY_ERROR[error.kind] ?? 'UNAVAILABLE';
            if (state === 'UNAVAILABLE')
                Logger.warn(`Order analytics: ${error.message}`, loggerCtx);
            return { state, ...empty };
        }
        throw error;
    }
}
