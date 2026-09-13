import { Inject, Injectable, Logger } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS, RECONCILIATION_API_URL_DEFAULT, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

export interface ReconciliationSummary {
    aggregateType: string;
    count: number;
    // null (not 0) means this aggregate type has no active/inactive concept upstream at all —
    // currently only true for storageLocation, per Integration Service's own contract (issue
    // #84's Step 0). Reconcile against activeCount everywhere it isn't null; against count where
    // it is.
    activeCount: number | null;
    lastModifiedMax: string | null;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// The only outbound caller of Integration Service's reconciliation summary API (issue #84's Step
// 0: GET /api/reconciliation/v1/summary, X-Api-Key auth). A transient failure here must never
// read as "zero discrepancies" — ReconciliationService treats a thrown error as "skip this type
// for this run", never as "0 upstream, so 0 discrepancies" (see external-integration-rules skill:
// no silent drops). Retries a bounded number of times with backoff for a transient failure before
// giving up; a non-2xx/non-network response after that still throws, it is never swallowed here.
@Injectable()
export class ReconciliationSummaryClient {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async fetchSummaries(aggregateType?: string): Promise<ReconciliationSummary[]> {
        const url = new URL(
            '/api/reconciliation/v1/summary',
            this.options.reconciliationApiUrl ?? RECONCILIATION_API_URL_DEFAULT,
        );
        if (aggregateType) url.searchParams.set('aggregateType', aggregateType);

        let lastError: Error | undefined;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
            try {
                return await this.fetchOnce(url.toString());
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                Logger.warn(
                    `Reconciliation summary fetch attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastError.message}`,
                    loggerCtx,
                );
                if (attempt < MAX_ATTEMPTS) {
                    await this.delay(RETRY_BASE_DELAY_MS * attempt);
                }
            }
        }
        throw lastError;
    }

    private async fetchOnce(url: string): Promise<ReconciliationSummary[]> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                headers: { 'X-Api-Key': this.options.reconciliationApiKey ?? '' },
                signal: controller.signal,
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(
                    `Reconciliation summary endpoint returned ${response.status}: ${body}`,
                );
            }
            return (await response.json()) as ReconciliationSummary[];
        } finally {
            clearTimeout(timeout);
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
