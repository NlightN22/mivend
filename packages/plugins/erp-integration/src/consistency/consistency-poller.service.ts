import { Inject, Injectable, Logger } from '@nestjs/common';
import { RequestContext, RequestContextService } from '@vendure/core';

import { ERP_INTEGRATION_PLUGIN_OPTIONS, loggerCtx } from '../types';
import type { ErpIntegrationPluginOptions } from '../types';
import { ConsistencyClientError } from './consistency-client-error';
import { evaluateSummary, healthFromError, isUnavailable } from './consistency-health';
import type { HealthVerdict } from './consistency-health';
import { ConsistencyReportStore } from './consistency-report.store';
import { ConsistencySourceClient } from './consistency-source.client';
import type { ConsistencySourceConfig, ConsistencySummary } from './consistency-types';

// 500 per page: a runaway or looping cursor must end the run, not the process.
const MAX_PAGES = 400;

export interface PollResult {
    source: string;
    health: HealthVerdict['health'];
    stored: number;
}

@Injectable()
export class ConsistencyPollerService {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly requestContextService: RequestContextService,
        private readonly store: ConsistencyReportStore,
    ) {}

    async pollAll(): Promise<PollResult[]> {
        const results: PollResult[] = [];
        for (const config of this.options.consistencySources ?? []) {
            results.push(await this.pollSource(config, new ConsistencySourceClient(config)));
        }
        return results;
    }

    async pollSource(
        config: ConsistencySourceConfig,
        client: ConsistencySourceClient,
    ): Promise<PollResult> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const state = await this.store.getState(ctx, config.source);
        let verdict: HealthVerdict = { health: 'ok', detail: '' };
        let summary: ConsistencySummary | null = null;
        let watermark: string | null = null;
        let stored = 0;
        try {
            summary = await client.getSummary();
            verdict = evaluateSummary(
                summary,
                state?.lastFinishedAt ?? null,
                config.checkIntervalMs,
                new Date(),
            );
            const collected = await this.collectIssues(
                ctx,
                config,
                client,
                state?.watermark ?? null,
            );
            watermark = collected.watermark;
            stored = collected.stored;
        } catch (err) {
            if (!(err instanceof ConsistencyClientError)) throw err;
            verdict = healthFromError(err);
            Logger.warn(`Consistency poll of ${config.source} failed: ${err.message}`, loggerCtx);
        }
        await this.recordOutcome(ctx, config.source, verdict, summary, watermark);
        return { source: config.source, health: verdict.health, stored };
    }

    private async collectIssues(
        ctx: RequestContext,
        config: ConsistencySourceConfig,
        client: ConsistencySourceClient,
        since: Date | null,
    ): Promise<{ watermark: string | null; stored: number }> {
        const seenCursors = new Set<string>();
        let cursor: string | null = null;
        let watermark: string | null = null;
        let stored = 0;
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const result = await client.getIssuesPage({
                since: since?.toISOString() ?? null,
                cursor,
            });
            await this.store.upsertIssues(ctx, config.source, result.items);
            stored += result.items.length;
            for (const item of result.items) {
                if (watermark === null || Date.parse(item.lastDetectedAt) > Date.parse(watermark)) {
                    watermark = item.lastDetectedAt;
                }
            }
            if (result.nextCursor === null) return { watermark, stored };
            if (seenCursors.has(result.nextCursor)) {
                throw new ConsistencyClientError('malformed', 'Cursor did not advance');
            }
            seenCursors.add(result.nextCursor);
            cursor = result.nextCursor;
        }
        throw new ConsistencyClientError('malformed', `More than ${MAX_PAGES} pages`);
    }

    private async recordOutcome(
        ctx: RequestContext,
        source: string,
        verdict: HealthVerdict,
        summary: ConsistencySummary | null,
        watermark: string | null,
    ): Promise<void> {
        await this.store.writeState(ctx, {
            source,
            health: verdict.health,
            detail: verdict.detail,
            summary,
            lastFinishedAt: summary?.lastCheck.finishedAt ?? null,
            watermark,
            succeeded: verdict.health === 'ok' || verdict.health === 'stale',
        });
        if (verdict.health === 'ok') await this.store.resolveUnavailable(ctx, source);
        else if (isUnavailable(verdict.health)) {
            await this.store.markUnavailable(ctx, source, verdict.health, verdict.detail);
        }
    }
}
