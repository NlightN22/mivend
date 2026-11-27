import { Inject, Injectable } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

export interface ReplayResult {
    entityId: string;
    status: string;
}

export const REPLAY_MAX_IDS = 200;
const FETCH_TIMEOUT_MS = 15_000;

export class ReplayRateLimitedError extends Error {
    constructor() {
        super('Replay endpoint returned 429');
    }
}

// Asks Integration Service to re-publish specific entities (POST /api/resync/v1/replay); the
// events then arrive through the normal consumer. Same base URL and API key as reconciliation.
@Injectable()
export class ResyncReplayClient {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async replay(
        aggregateType: string,
        entityIds: string[],
        apiKey?: string,
        dryRun = false,
    ): Promise<ReplayResult[]> {
        const { resyncSourceSystem } = this.options;
        if (!resyncSourceSystem) {
            throw new Error('INTEGRATION_RESYNC_SOURCE_SYSTEM is not configured');
        }
        return this.post(
            '/api/resync/v1/replay',
            {
                aggregateType,
                sourceSystem: resyncSourceSystem,
                entityIds,
                ...(dryRun ? { dryRun: true } : {}),
            },
            apiKey,
        );
    }

    // Documents (orders and other ERP document kinds) are republished by uuid; dryRun reports without publishing.
    async replayDocuments(
        kind: string,
        entityIds: string[],
        dryRun: boolean,
        apiKey?: string,
    ): Promise<ReplayResult[]> {
        return this.post('/api/resync/v1/replay-documents', { kind, entityIds, dryRun }, apiKey);
    }

    private async post(path: string, body: unknown, apiKey?: string): Promise<ReplayResult[]> {
        const { reconciliationApiUrl } = this.options;
        if (!reconciliationApiUrl)
            throw new Error('INTEGRATION_SERVICE_BASE_URL is not configured');
        const response = await fetch(new URL(path, reconciliationApiUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': apiKey ?? this.options.reconciliationApiKey ?? '',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (response.status === 429) throw new ReplayRateLimitedError();
        if (!response.ok) {
            throw new Error(`Replay endpoint returned ${response.status}`);
        }
        const parsed = (await response.json()) as ReplayResult[] | { results: ReplayResult[] };
        return Array.isArray(parsed) ? parsed : parsed.results;
    }
}
