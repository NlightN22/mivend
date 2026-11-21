import { Inject, Injectable } from '@nestjs/common';

import {
    ExchangeHealthReadError,
    parseExchangeHealth,
    reasonForHttpStatus,
} from './exchange-health';
import type { ExchangeHealth } from './exchange-health';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const FETCH_TIMEOUT_MS = 10_000;

// One attempt per poll: the schedule is the retry. The key goes only into the header, never into a message.
@Injectable()
export class ExchangeHealthClient {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async fetchHealth(): Promise<ExchangeHealth> {
        const { reconciliationApiUrl: baseUrl, integrationOpsApiKey: key } = this.options;
        if (!baseUrl || !key) {
            throw new ExchangeHealthReadError(
                'NOT_CONFIGURED',
                'INTEGRATION_SERVICE_BASE_URL or INTEGRATION_SERVICE_OPS_API_KEY is not configured',
            );
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        let response: Response;
        try {
            response = await fetch(new URL('/api/ops/v1/exchange-health', baseUrl), {
                headers: { 'X-Api-Key': key },
                signal: controller.signal,
            });
        } catch (err) {
            const timedOut = controller.signal.aborted;
            throw new ExchangeHealthReadError(
                timedOut ? 'TIMEOUT' : 'UNREACHABLE',
                timedOut
                    ? 'exchange health request timed out'
                    : `exchange health request failed: ${err instanceof Error ? err.name : 'error'}`,
            );
        } finally {
            clearTimeout(timeout);
        }
        if (!response.ok) {
            throw new ExchangeHealthReadError(
                reasonForHttpStatus(response.status),
                `exchange health endpoint returned ${response.status}`,
            );
        }
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            throw new ExchangeHealthReadError('BAD_RESPONSE', 'exchange health body is not JSON');
        }
        return parseExchangeHealth(body);
    }
}
