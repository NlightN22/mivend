import { UserInputError } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { OrderAnalyticsFilterValuesService } from '../../order-analytics/order-analytics-filter-values.service';
import type { OrderMetricsClient } from '../../order-analytics/order-metrics.client';
import { OrderMetricsError } from '../../order-analytics/order-metrics.types';

const make = (impl: () => Promise<unknown>): OrderAnalyticsFilterValuesService => {
    const list = vi.fn(impl);
    return new OrderAnalyticsFilterValuesService({
        listOrderTurnoverFilterValues: list,
    } as unknown as OrderMetricsClient);
};

describe('OrderAnalyticsFilterValuesService', () => {
    it('returns the values with their counts', async () => {
        const values = [{ value: '', orderCount: 1 }];
        expect(await make(async () => values).list('ORDER_STATUS')).toEqual({
            state: 'OK',
            values,
        });
    });

    it.each([
        ['NOT_CONFIGURED', 'NOT_CONFIGURED'],
        ['TOO_LARGE', 'TOO_LARGE'],
        ['TIMEOUT', 'UNAVAILABLE'],
        ['UNAVAILABLE', 'UNAVAILABLE'],
    ] as const)('turns a %s failure into the %s state with no values', async (kind, state) => {
        const service = make(() => Promise.reject(new OrderMetricsError(kind, 'failed')));
        expect(await service.list('ORDER_STATUS')).toEqual({ state, values: [] });
    });

    it('rejects a bad request and a lone period bound as user input errors', async () => {
        await expect(
            make(() => Promise.reject(new OrderMetricsError('INVALID_ARGUMENT', 'bad'))).list(
                'ORDER_STATUS',
            ),
        ).rejects.toBeInstanceOf(UserInputError);
        await expect(
            make(async () => []).list('ORDER_STATUS', new Date(), null),
        ).rejects.toBeInstanceOf(UserInputError);
    });
});
