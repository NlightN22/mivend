import { Inject, Injectable, Logger } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS, RECONCILIATION_API_URL_DEFAULT, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

export interface ReconciliationSummary {
    aggregateType: string;
    count: number;
    // null (not 0) means this type has no active/inactive concept upstream (only storageLocation).
    // Reconcile against activeCount when non-null; against count when null.
    activeCount: number | null;
    lastModifiedMax: string | null;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// Failures must never read as zero discrepancies; ReconciliationService skips the type on a throw.
// Retries are bounded; a non-2xx or network error after retries still throws, never swallowed.
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
        // Upstream activeCount includes stock tied to deleted warehouses, which mivend cannot track locally.
        // Filter aligns both sides on one definition of active stock to avoid an unresolvable mismatch.
        if (aggregateType === 'stock') url.searchParams.set('excludeDeletedWarehouse', 'true');

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
