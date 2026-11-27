import { Inject, Injectable } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const FETCH_TIMEOUT_MS = 120_000;

export interface DiffWindow {
    afterId?: string;
    untilId?: string;
}

// POST /api/reconciliation/v1/diff, direction oursOnly: ids upstream has inside the window that the submitted list lacks.
@Injectable()
export class ReconciliationDiffClient {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async missingIds(
        aggregateType: string,
        knownIds: string[],
        window: DiffWindow,
        limit: number,
    ): Promise<string[]> {
        const { reconciliationApiUrl, resyncSourceSystem } = this.options;
        if (!reconciliationApiUrl)
            throw new Error('INTEGRATION_SERVICE_BASE_URL is not configured');
        if (!resyncSourceSystem)
            throw new Error('INTEGRATION_RESYNC_SOURCE_SYSTEM is not configured');
        const url = new URL('/api/reconciliation/v1/diff', reconciliationApiUrl);
        url.searchParams.set('limit', String(limit));
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': this.options.reconciliationApiKey ?? '',
            },
            body: JSON.stringify({
                aggregateType,
                sourceSystem: resyncSourceSystem,
                entityIds: knownIds,
                direction: 'oursOnly',
                includeTotal: false,
                ...window,
            }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`Diff endpoint returned ${response.status}`);
        const body = (await response.json()) as { items?: unknown };
        if (!Array.isArray(body.items) || body.items.some(i => typeof i !== 'string')) {
            throw new Error('Diff endpoint returned an unexpected body');
        }
        return body.items as string[];
    }
}
