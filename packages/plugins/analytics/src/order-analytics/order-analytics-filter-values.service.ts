import { Injectable } from '@nestjs/common';
import { Logger, UserInputError } from '@vendure/core';

import { loggerCtx } from '../types';
import { OrderMetricsClient } from './order-metrics.client';
import { OrderMetricsError } from './order-metrics.types';
import type { OrderFilterKind, OrderFilterValue } from './order-metrics.types';
import type { OrderAnalyticsState } from './order-analytics.service';

export interface OrderAnalyticsFilterValuesResult {
    state: OrderAnalyticsState;
    values: OrderFilterValue[];
}

const STATE_BY_ERROR: Record<string, OrderAnalyticsState> = {
    NOT_CONFIGURED: 'NOT_CONFIGURED',
    TOO_LARGE: 'TOO_LARGE',
};

// The counts are service-wide for the analytics key, not narrowed to the viewer's scope.
@Injectable()
export class OrderAnalyticsFilterValuesService {
    constructor(private readonly client: OrderMetricsClient) {}

    async list(
        kind: OrderFilterKind,
        from?: Date | null,
        to?: Date | null,
    ): Promise<OrderAnalyticsFilterValuesResult> {
        if (Boolean(from) !== Boolean(to)) {
            throw new UserInputError('from and to must be given together');
        }
        try {
            const values = await this.client.listOrderTurnoverFilterValues(
                kind,
                from ?? undefined,
                to ?? undefined,
            );
            return { state: 'OK', values };
        } catch (error) {
            if (!(error instanceof OrderMetricsError)) throw error;
            if (error.kind === 'INVALID_ARGUMENT') throw new UserInputError(error.message);
            const state = STATE_BY_ERROR[error.kind] ?? 'UNAVAILABLE';
            if (state === 'UNAVAILABLE') {
                Logger.warn(`Order analytics filter values: ${error.message}`, loggerCtx);
            }
            return { state, values: [] };
        }
    }
}
