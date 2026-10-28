import { Inject, Injectable } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
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
        const { reconciliationApiUrl, resyncSourceSystem } = this.options;
        if (!reconciliationApiUrl)
            throw new Error('INTEGRATION_SERVICE_BASE_URL is not configured');
        if (!resyncSourceSystem) {
            throw new Error('INTEGRATION_RESYNC_SOURCE_SYSTEM is not configured');
        }
        const url = new URL('/api/resync/v1/replay', reconciliationApiUrl);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': this.options.reconciliationApiKey ?? '',
            },
            body: JSON.stringify({
                aggregateType,
                sourceSystem: resyncSourceSystem,
                entityIds,
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            throw new Error(`Replay endpoint returned ${response.status}`);
        }
        const body = (await response.json()) as ReplayResult[] | { results: ReplayResult[] };
        return Array.isArray(body) ? body : body.results;
    }
}
