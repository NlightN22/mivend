import { Inject, Injectable } from '@nestjs/common';

import {
    ExchangePrioritiesError,
    MAX_PRIORITIES_BODY_BYTES,
    parseExchangePriorities,
} from './exchange-priorities';
import type { ExchangePriorityTable } from './exchange-priorities';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const FETCH_TIMEOUT_MS = 10_000;

export type PrioritiesFetch =
    | { unchanged: true }
    | { unchanged: false; table: ExchangePriorityTable };

// Same call pattern as ExchangeHealthClient: ops key in the header only, redirects refused, one attempt.
@Injectable()
export class ExchangePrioritiesClient {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    isConfigured(): boolean {
        return Boolean(this.options.reconciliationApiUrl && this.options.integrationOpsApiKey);
    }

    async fetchTable(knownHash: string | null): Promise<PrioritiesFetch> {
        const { reconciliationApiUrl: baseUrl, integrationOpsApiKey: key } = this.options;
        if (!baseUrl || !key) {
            throw new ExchangePrioritiesError('priorities endpoint is not configured');
        }
        const url = new URL('/api/ops/v1/exchange-priorities', baseUrl);
        if (knownHash) url.search = `hash=${encodeURIComponent(knownHash)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                headers: { 'X-Api-Key': key },
                signal: controller.signal,
                redirect: 'error',
            });
            if (response.status === 304) return { unchanged: true };
            if (!response.ok) {
                throw new ExchangePrioritiesError(
                    `priorities endpoint returned ${response.status}`,
                );
            }
            let json: unknown;
            try {
                json = JSON.parse(await readBounded(response));
            } catch (err) {
                if (err instanceof ExchangePrioritiesError) throw err;
                throw new ExchangePrioritiesError('priorities body is not JSON');
            }
            return { unchanged: false, table: parseExchangePriorities(json) };
        } finally {
            clearTimeout(timeout);
        }
    }
}

async function readBounded(response: Response): Promise<string> {
    if (Number(response.headers.get('content-length') ?? 0) > MAX_PRIORITIES_BODY_BYTES) {
        throw new ExchangePrioritiesError('priorities body exceeds the size limit');
    }
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PRIORITIES_BODY_BYTES) {
            await reader.cancel();
            throw new ExchangePrioritiesError('priorities body exceeds the size limit');
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
}
