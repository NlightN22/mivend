import { Injectable } from '@nestjs/common';
import { Logger, RequestContextService, TransactionalConnection } from '@vendure/core';

import { ExchangeHealthSnapshot } from './entities/exchange-health-snapshot.entity';
import { ExchangeHealthClient } from './exchange-health.client';
import { ExchangeHealthReadError } from './exchange-health';
import type { ExchangeHealth, ExchangeState, ExchangeUnknownReason } from './exchange-health';
import { loggerCtx } from './types';

export const EXCHANGE_SNAPSHOT_KEY = 'exchange';

export interface ExchangePollResult {
    state: ExchangeState;
    reason: ExchangeUnknownReason | null;
}

// A failed read is stored as UNKNOWN with its reason class, never skipped: a stale green must not survive an outage.
@Injectable()
export class ExchangeHealthPollerService {
    constructor(
        private readonly client: ExchangeHealthClient,
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
    ) {}

    async pollOnce(): Promise<ExchangePollResult> {
        let health: ExchangeHealth | null = null;
        let reason: ExchangeUnknownReason | null = null;
        try {
            health = await this.client.fetchHealth();
        } catch (err) {
            reason = err instanceof ExchangeHealthReadError ? err.reason : 'UNREACHABLE';
            Logger.warn(
                `Exchange health unreadable (${reason}): ${err instanceof Error ? err.message : 'error'}`,
                loggerCtx,
            );
        }
        const state: ExchangeState = health ? health.status : 'UNKNOWN';
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        await this.connection
            .getRepository(ctx, ExchangeHealthSnapshot)
            .upsert({ key: EXCHANGE_SNAPSHOT_KEY, state, reason, health, polledAt: new Date() }, [
                'key',
            ]);
        return { state, reason };
    }
}
