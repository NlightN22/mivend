import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, UserInputError } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import { loggerCtx } from '../types';
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
    ) {}

    async query(ctx: RequestContext, input: OrderAnalyticsInput): Promise<OrderAnalyticsResult> {
        const filters = this.requestedFilters(input);
        try {
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
            const nothingVisible =
                (limited && customerIds.length === 0) ||
                (visibleManagers !== null &&
                    filters.managerIds.length > 0 &&
                    managerIds.length === 0);
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
                        ...filters,
                        customerIds: customers,
                        managerIds,
                    })),
                );
            }
            const visibleRows =
                input.dimension === 'MANAGER' && visibleManagers !== null
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

    private requestedFilters(input: OrderAnalyticsInput): OrderMetricsFilters {
        const filters: OrderMetricsFilters = {
            customerIds: input.customerIds ?? [],
            organizationIds: input.organizationIds ?? [],
            pointOfSaleIds: input.pointOfSaleIds ?? [],
            managerIds: input.managerIds ?? [],
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
