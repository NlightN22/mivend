import { Inject, Injectable } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

export interface ReplayResult {
    entityId: string;
    status: string;
}

export const REPLAY_MAX_IDS = 200;
const FETCH_TIMEOUT_MS = 15_000;

export class ReplayDryRunIgnoredError extends Error {
    constructor() {
        super('Replay dry-run answer did not carry dryRun: true');
    }
}

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
        return (await this.replayRaw(aggregateType, entityIds, apiKey, dryRun)).results;
    }

    private async replayRaw(
        aggregateType: string,
        entityIds: string[],
        apiKey: string | undefined,
        dryRun: boolean,
    ): Promise<{ results: ReplayResult[]; dryRun?: boolean }> {
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
        return (
            await this.post('/api/resync/v1/replay-documents', { kind, entityIds, dryRun }, apiKey)
        ).results;
    }

    // Generic replay answers a source per id (replayed_from_* or not_found), not republished/would_republish;
    // a dry-run answer must carry dryRun: true or the platform ignored the flag.
    async replayForHeal(
        aggregateType: string,
        entityIds: string[],
        dryRun: boolean,
        apiKey?: string,
    ): Promise<ReplayResult[]> {
        const { results, dryRun: answeredDryRun } = await this.replayRaw(
            aggregateType,
            entityIds,
            apiKey,
            dryRun,
        );
        if (dryRun && answeredDryRun !== true) throw new ReplayDryRunIgnoredError();
        return results.map(r =>
            r.status.startsWith('replayed_from_')
                ? { ...r, status: dryRun ? 'would_republish' : 'republished' }
                : r,
        );
    }

    private async post(
        path: string,
        body: unknown,
        apiKey?: string,
    ): Promise<{ results: ReplayResult[]; dryRun?: boolean }> {
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
        const parsed = (await response.json()) as
            | ReplayResult[]
            | { results: ReplayResult[]; dryRun?: boolean };
        return Array.isArray(parsed)
            ? { results: parsed }
            : { results: parsed.results, dryRun: parsed.dryRun };
    }
}
