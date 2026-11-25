import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';

import { ExchangePrioritiesClient } from './exchange-priorities.client';
import {
    ERP_INTEGRATION_PLUGIN_OPTIONS,
    EXCHANGE_HEALTH_POLL_INTERVAL_DEFAULT,
    loggerCtx,
} from './types';
import type { ErpIntegrationPluginOptions } from './types';

export interface StreamLevelSource {
    getLevels(): ReadonlyMap<string, number>;
}

const EMPTY_LEVELS: ReadonlyMap<string, number> = new Map();

// Refreshes in the background on the health-poll cadence; the claim path never waits on the network.
@Injectable()
export class ExchangePrioritiesService implements StreamLevelSource {
    private levels: ReadonlyMap<string, number> = EMPTY_LEVELS;
    private hash: string | null = null;
    private lastAttemptAt = 0;
    private inFlight: Promise<void> | null = null;

    constructor(
        private readonly client: ExchangePrioritiesClient,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    getLevels(): ReadonlyMap<string, number> {
        const everyMs =
            this.options.exchangeHealthPollIntervalMs ?? EXCHANGE_HEALTH_POLL_INTERVAL_DEFAULT;
        const due = Date.now() - this.lastAttemptAt >= everyMs;
        if (!this.inFlight && due && this.client.isConfigured()) {
            this.inFlight = this.refresh().finally(() => {
                this.inFlight = null;
            });
        }
        return this.levels;
    }

    async refresh(): Promise<void> {
        this.lastAttemptAt = Date.now();
        try {
            const result = await this.client.fetchTable(this.hash);
            if (result.unchanged) return;
            this.levels = result.table.levels;
            this.hash = result.table.hash;
        } catch (err) {
            Logger.warn(
                `Exchange priorities unreadable, keeping the last table: ${err instanceof Error ? err.message : 'error'}`,
                loggerCtx,
            );
        }
    }
}
