import { Inject, Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { ReconciliationDiffClient } from './reconciliation-diff.client';
import {
    HEAL_MAX_IDS_PER_RUN,
    HEAL_RATE_LIMIT_RETRIES,
    checkBatch,
    isAlarmOutcome,
    toBatches,
} from './reconciliation-heal-policy';
import type { BatchTally, HealOutcome } from './reconciliation-heal-policy';
import {
    DOCUMENT_KINDS,
    ReconciliationLocalIdsService,
    hasLocalIdSource,
} from './reconciliation-local-ids.service';
import { ReconciliationStateService } from './reconciliation-state.service';
import { ReplayRateLimitedError, ResyncReplayClient } from './resync-replay.client';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

const DIFF_WINDOW = 50_000;
const DIFF_PAGE_LIMIT = 5000;
const BATCH_PAUSE_MS = 2000;
const RATE_LIMIT_PAUSE_MS = 30_000;

export interface HealReport {
    outcome: HealOutcome | 'skipped';
    detail: string;
    alarm: boolean;
}

class HealStop extends Error {
    constructor(
        readonly outcome: HealOutcome,
        message: string,
    ) {
        super(message);
    }
}

// Self-healing for a stalled gap: exact missing ids from the platform diff, a dry-run batch, then (heal key only)
// real batches. Extra rows on our side are never deleted. Rules: docs/sync.md "Reconciliation".
@Injectable()
export class ReconciliationHealService {
    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly states: ReconciliationStateService,
        private readonly localIds: ReconciliationLocalIdsService,
        private readonly diff: ReconciliationDiffClient,
        private readonly replay: ResyncReplayClient,
    ) {}

    async healIfDue(ctx: RequestContext, aggregateType: string): Promise<HealReport> {
        const healKey = this.options.reconciliationHealApiKey;
        const now = new Date();
        const decision = await this.states.claimHeal(ctx, aggregateType, now, Boolean(healKey));
        if (!decision.heal) {
            return {
                outcome: 'skipped',
                detail: decision.reason,
                alarm: decision.reason === 'attempts-exhausted',
            };
        }
        let outcome: HealOutcome;
        let detail: string;
        let success = false;
        try {
            ({ outcome, detail, success } = await this.heal(
                ctx,
                aggregateType,
                decision.realRun,
                healKey,
            ));
        } catch (err) {
            outcome = err instanceof HealStop ? err.outcome : 'batch-failed';
            detail = err instanceof Error ? err.message : String(err);
            Logger.error(
                `Reconciliation healing of ${aggregateType} stopped: ${detail}`,
                loggerCtx,
            );
        }
        const row = await this.states.finishHeal(ctx, aggregateType, {
            outcome,
            detail,
            realRun: decision.realRun,
            success,
        });
        return { outcome, detail, alarm: isAlarmOutcome(outcome, row.healAttempts) };
    }

    private async heal(
        ctx: RequestContext,
        aggregateType: string,
        realRun: boolean,
        healKey: string | undefined,
    ): Promise<{ outcome: HealOutcome; detail: string; success: boolean }> {
        if (!hasLocalIdSource(aggregateType)) {
            return {
                outcome: 'no-id-source',
                detail: 'No id diff source for this aggregate; the gap is reported only',
                success: false,
            };
        }
        const missing = await this.collectMissing(ctx, aggregateType);
        const known = await this.states.knownNotFound(ctx, aggregateType, missing);
        const ids = missing.filter(id => !known.has(id)).slice(0, HEAL_MAX_IDS_PER_RUN);
        if (ids.length === 0) {
            return {
                outcome: 'nothing-missing',
                detail: 'The diff holds no id to ask for',
                success: false,
            };
        }
        const batches = toBatches(ids);
        const isDocument = DOCUMENT_KINDS.has(aggregateType);
        if (isDocument) {
            const dry = await this.sendBatch(ctx, aggregateType, batches[0], true, undefined);
            if (dry.wouldRepublish === 0) {
                throw new HealStop('all-not-found', 'The dry-run batch found no id upstream');
            }
            if (!realRun) {
                return {
                    outcome: 'dry-run-only',
                    detail: `${ids.length} ids missing locally; first batch: ${dry.wouldRepublish} would republish, ${dry.notFound.length} not found`,
                    success: false,
                };
            }
        } else if (!realRun) {
            return {
                outcome: 'dry-run-only',
                detail: `${ids.length} ids missing locally; no platform dry run exists for this kind`,
                success: false,
            };
        }
        let republished = 0;
        let notFound = 0;
        for (const [index, batch] of batches.entries()) {
            if (index > 0) await this.pause(BATCH_PAUSE_MS);
            const tally = await this.sendBatch(ctx, aggregateType, batch, false, healKey);
            republished += tally.republished;
            notFound += tally.notFound.length;
        }
        if (republished === 0) {
            throw new HealStop(
                'all-not-found',
                `${notFound} ids answered not_found, nothing republished`,
            );
        }
        return {
            outcome: 'healed',
            detail: `${republished} republished, ${notFound} not found of ${ids.length} asked`,
            success: true,
        };
    }

    private async collectMissing(ctx: RequestContext, aggregateType: string): Promise<string[]> {
        const missing: string[] = [];
        let afterId: string | null = null;
        for (;;) {
            const page = await this.localIds.idPage(ctx, aggregateType, afterId, DIFF_WINDOW);
            const last = page.length > 0 ? page[page.length - 1] : undefined;
            const isLast = page.length < DIFF_WINDOW;
            missing.push(
                ...(await this.diff.missingIds(
                    aggregateType,
                    page,
                    {
                        ...(afterId === null ? {} : { afterId }),
                        ...(isLast || last === undefined ? {} : { untilId: last }),
                    },
                    DIFF_PAGE_LIMIT,
                )),
            );
            if (isLast || last === undefined || missing.length >= HEAL_MAX_IDS_PER_RUN * 2)
                return missing;
            afterId = last;
        }
    }

    private async sendBatch(
        ctx: RequestContext,
        aggregateType: string,
        batch: string[],
        dryRun: boolean,
        apiKey: string | undefined,
    ): Promise<BatchTally> {
        const results = await this.send(aggregateType, batch, dryRun, apiKey);
        const checked = checkBatch(batch, results, dryRun);
        if (!checked.ok) throw new HealStop(checked.reason, `Batch refused: ${checked.reason}`);
        await this.states.rememberNotFound(ctx, aggregateType, checked.tally.notFound);
        return checked.tally;
    }

    private async send(
        aggregateType: string,
        batch: string[],
        dryRun: boolean,
        apiKey: string | undefined,
    ): Promise<Array<{ entityId: string; status: string }>> {
        for (let attempt = 0; ; attempt += 1) {
            try {
                return DOCUMENT_KINDS.has(aggregateType)
                    ? await this.replay.replayDocuments(aggregateType, batch, dryRun, apiKey)
                    : await this.replay.replay(aggregateType, batch, apiKey);
            } catch (err) {
                if (
                    !(err instanceof ReplayRateLimitedError) ||
                    attempt >= HEAL_RATE_LIMIT_RETRIES
                ) {
                    throw err;
                }
                await this.pause(RATE_LIMIT_PAUSE_MS);
            }
        }
    }

    protected pause(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
