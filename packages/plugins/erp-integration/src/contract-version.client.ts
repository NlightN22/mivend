import { Inject, Injectable } from '@nestjs/common';
import { Logger } from '@vendure/core';

import { ERP_INTEGRATION_PLUGIN_OPTIONS, EVENT_CONTRACTS_REGISTRY_URL, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const CACHE_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;

@Injectable()
export class ContractVersionClient {
    private cached: { version: string; at: number } | null = null;

    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async getLatestVersion(): Promise<string | null> {
        const token = this.options.eventContractsRegistryToken;
        if (!token) return null;
        if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) return this.cached.version;
        try {
            const response = await fetch(EVENT_CONTRACTS_REGISTRY_URL, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`Registry returned ${response.status}`);
            const body = (await response.json()) as { 'dist-tags'?: { latest?: string } };
            const version = body['dist-tags']?.latest;
            if (!version) throw new Error('Registry response has no latest dist-tag');
            this.cached = { version, at: Date.now() };
            return version;
        } catch (error) {
            Logger.warn(
                `Could not look up the latest event-contracts version: ${error instanceof Error ? error.message : String(error)}`,
                loggerCtx,
            );
            return this.cached?.version ?? null;
        }
    }
}
