import { Inject, Injectable } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS, RECONCILIATION_API_URL_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

export interface ReplayResult {
    entityId: string;
    status: string;
}

export const REPLAY_MAX_IDS = 200;
const FETCH_TIMEOUT_MS = 15_000;

// Asks Integration Service to re-publish specific entities (POST /api/resync/v1/replay); the
// events then arrive through the normal consumer. Same base URL and API key as reconciliation.
@Injectable()
export class ResyncReplayClient {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async replay(aggregateType: string, entityIds: string[]): Promise<ReplayResult[]> {
        const url = new URL(
            '/api/resync/v1/replay',
            this.options.reconciliationApiUrl ?? RECONCILIATION_API_URL_DEFAULT,
        );
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': this.options.reconciliationApiKey ?? '',
            },
            body: JSON.stringify({ aggregateType, sourceSystem: 'onec-main', entityIds }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            throw new Error(`Replay endpoint returned ${response.status}`);
        }
        const body = (await response.json()) as ReplayResult[] | { results: ReplayResult[] };
        return Array.isArray(body) ? body : body.results;
    }
}
