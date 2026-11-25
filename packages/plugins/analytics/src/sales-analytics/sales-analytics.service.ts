import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, UserInputError } from '@vendure/core';
import { QueryTooLargeError } from 'shared';

import { resolveEntityFilters } from '../order-analytics/order-analytics-entity-filters';
import type { EntityNameFilter } from '../order-analytics/order-analytics-entity-filters';
import { OrderAnalyticsEntityNamesService } from '../order-analytics/order-analytics-entity-names.service';
import { OrderAnalyticsLabelsService } from '../order-analytics/order-analytics-labels.service';
import { OrderAnalyticsScopeService } from '../order-analytics/order-analytics-scope.service';
import { MAX_FILTER_VALUES, OrderMetricsError } from '../order-analytics/order-metrics.types';
import type { OrderGranularity } from '../order-analytics/order-metrics.types';
import { loggerCtx } from '../types';
import { SalesCurrencyResolverService } from './sales-currency-resolver.service';
import { SalesMetricsClient } from './sales-metrics.client';
import type { SalesDimension, SalesTurnover, SalesTurnoverRow } from './sales-metrics.types';
import { mergeSalesRows } from './sales-turnover-merge';

export type SalesAnalyticsState = 'OK' | 'NOT_CONFIGURED' | 'TOO_LARGE' | 'UNAVAILABLE';

export interface SalesAnalyticsInput {
    from: Date;
    to: Date;
    granularity: OrderGranularity;
    dimension: SalesDimension;
    timeZone?: string | null;
    // Names typed in the filter builder; resolved to ERP ids here, inside the viewer's scope.
    entityFilters?: EntityNameFilter[] | null;
    mainManagerOnly?: boolean | null;
}

export interface SalesAnalyticsRow extends SalesTurnoverRow {
    label: string;
}

export interface SalesAnalyticsResult {
    state: SalesAnalyticsState;
    rows: SalesAnalyticsRow[];
    correctionsWithoutEffect: number;
    unresolvedCurrencies: string[];
    limitedToVisibleCustomers: boolean;
}

const EMPTY = {
    rows: [],
    correctionsWithoutEffect: 0,
    unresolvedCurrencies: [],
};

const SALES_KINDS = ['CUSTOMER', 'ORGANIZATION', 'CONTRACT', 'COUNTERPARTY_MANAGER'];

const intersect = (requested: string[], visible: string[]): string[] => {
    const allowed = new Set(visible);
    return requested.filter(id => allowed.has(id));
};

const chunk = <T>(items: T[], size: number): T[][] => {
    const parts: T[][] = [];
    for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
    return parts;
};

const STATE_BY_ERROR: Record<string, SalesAnalyticsState> = {
    NOT_CONFIGURED: 'NOT_CONFIGURED',
    TOO_LARGE: 'TOO_LARGE',
};

@Injectable()
export class SalesAnalyticsService {
    constructor(
        private readonly client: SalesMetricsClient,
        private readonly scope: OrderAnalyticsScopeService,
        private readonly labels: OrderAnalyticsLabelsService,
        private readonly entityNames: OrderAnalyticsEntityNamesService,
        private readonly currencies: SalesCurrencyResolverService,
    ) {}

    async query(ctx: RequestContext, input: SalesAnalyticsInput): Promise<SalesAnalyticsResult> {
        try {
            const filters = input.entityFilters ?? [];
            if (filters.some(f => !SALES_KINDS.includes(f.kind))) {
                throw new UserInputError('Sales cannot be filtered by this kind');
            }
            const named = await resolveEntityFilters(ctx, this.entityNames, filters);
            const [visibleCustomers, visibleManagers] = await Promise.all([
                this.scope.visibleCustomerErpIds(ctx),
                this.scope.visibleManagerErpIds(ctx),
            ]);
            const limited = visibleCustomers !== null;
            const counterpartyIds =
                visibleCustomers === null
                    ? named.customerIds
                    : named.customerIds.length
                      ? intersect(named.customerIds, visibleCustomers)
                      : visibleCustomers;
            const counterpartyManagerIds =
                visibleManagers !== null && named.counterpartyManagerIds.length
                    ? intersect(named.counterpartyManagerIds, visibleManagers)
                    : named.counterpartyManagerIds;
            const nothingVisible =
                named.unmatched ||
                (limited && counterpartyIds.length === 0) ||
                (visibleManagers !== null &&
                    named.counterpartyManagerIds.length > 0 &&
                    counterpartyManagerIds.length === 0);
            if (nothingVisible)
                return { state: 'OK', ...EMPTY, limitedToVisibleCustomers: limited };

            const fetched = await this.fetchAll(input, {
                counterpartyIds,
                organizationIds: named.organizationIds,
                contractIds: named.contractIds,
                counterpartyManagerIds,
            });
            const visibleRows =
                input.dimension === 'COUNTERPARTY_MANAGER' && visibleManagers !== null
                    ? fetched.rows.filter(r => visibleManagers.includes(r.dimensionId))
                    : fetched.rows;
            const toCode = await this.currencies.resolver(ctx, [
                ...visibleRows.map(r => r.currency),
                ...fetched.unresolvedCurrencies,
            ]);
            const rows = mergeSalesRows(
                visibleRows.map(r => ({ ...r, currency: toCode(r.currency) })),
            );
            const names = await this.labels.labelsFor(ctx, input.dimension, [
                ...new Set(rows.map(r => r.dimensionId).filter(Boolean)),
            ]);
            return {
                state: 'OK',
                rows: rows.map(r => ({ ...r, label: names.get(r.dimensionId) ?? r.dimensionId })),
                correctionsWithoutEffect: fetched.correctionsWithoutEffect,
                unresolvedCurrencies: fetched.unresolvedCurrencies.filter(c => toCode(c) === c),
                limitedToVisibleCustomers: limited,
            };
        } catch (error) {
            return this.failure(error);
        }
    }

    // A long counterparty list goes in parts; the parts hold different counterparties, so their counters add up.
    private async fetchAll(
        input: SalesAnalyticsInput,
        ids: {
            counterpartyIds: string[];
            organizationIds: string[];
            contractIds: string[];
            counterpartyManagerIds: string[];
        },
    ): Promise<SalesTurnover> {
        const total: SalesTurnover = { ...EMPTY, rows: [] } as SalesTurnover;
        const currencies = new Set<string>();
        const parts = chunk(ids.counterpartyIds, MAX_FILTER_VALUES);
        for (const counterparties of parts.length ? parts : [[]]) {
            const part = await this.client.getSalesTurnover({
                from: input.from,
                to: input.to,
                granularity: input.granularity,
                dimension: input.dimension,
                timeZone: input.timeZone ?? '',
                mainManagerOnly: input.mainManagerOnly ?? false,
                ...ids,
                counterpartyIds: counterparties,
            });
            total.rows.push(...part.rows);
            total.correctionsWithoutEffect += part.correctionsWithoutEffect;
            part.unresolvedCurrencies.forEach(c => currencies.add(c));
        }
        total.unresolvedCurrencies = [...currencies];
        return total;
    }

    private failure(error: unknown): SalesAnalyticsResult {
        const empty = { ...EMPTY, limitedToVisibleCustomers: false };
        if (error instanceof QueryTooLargeError) return { state: 'TOO_LARGE', ...empty };
        if (error instanceof OrderMetricsError) {
            if (error.kind === 'INVALID_ARGUMENT') throw new UserInputError(error.message);
            const state = STATE_BY_ERROR[error.kind] ?? 'UNAVAILABLE';
            if (state === 'UNAVAILABLE')
                Logger.warn(`Sales analytics: ${error.message}`, loggerCtx);
            return { state, ...empty };
        }
        throw error;
    }
}
