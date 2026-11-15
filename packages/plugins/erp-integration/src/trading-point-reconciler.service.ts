import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { TradingPointChangedListener } from './trading-point-changed.listener';

const loggerCtx = 'TradingPointReconciler';
const SWEEP_LIMIT = 100;

// Re-drives a point whose current version has no outbox row at all (crash between the change
// commit and the enqueue). The enqueue is idempotent by uuid + version, so racing the live listener is safe.
@Injectable()
export class TradingPointReconciler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly listener: TradingPointChangedListener,
        private readonly requestContextService: RequestContextService,
    ) {}

    async sweep(): Promise<number> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const points = await ctxQuery<Array<{ uuid: string; version: number }>>(
            this.connection,
            ctx,
            `SELECT tp.uuid, tp.version FROM trading_point tp
              WHERE tp.version > 0
                AND NOT EXISTS (SELECT 1 FROM integration_outbox x
                                 WHERE x.event_type = 'trading-point.changed'
                                   AND x.payload ->> 'uuid' = tp.uuid::text
                                   AND (x.payload ->> 'version')::bigint >= tp.version)
              ORDER BY tp.id ASC LIMIT ${SWEEP_LIMIT}`,
        );
        let redriven = 0;
        for (const point of points) {
            try {
                await this.listener.enqueueVersion(ctx, point.uuid, point.version);
                redriven += 1;
            } catch (error) {
                Logger.error(
                    `Re-drive of trading point ${point.uuid} failed: ${String(error)}`,
                    loggerCtx,
                );
            }
        }
        return redriven;
    }
}
