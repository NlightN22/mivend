import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { RetroBonusRuleService } from '@mivend/plugin-retro-bonus';
import type { RetroBonusRuleUpsertInput } from '@mivend/plugin-retro-bonus';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { inboundApplied } from './inbound-stream-handler';
import type {
    BatchInboundItem,
    BatchInboundResult,
    BatchInboundStreamHandler,
    InboundOutcome,
} from './inbound-stream-handler';
import { parseRetroBonusRule } from './retro-bonus-rule-payload';

const loggerCtx = 'IntegrationRetroBonusRuleHandler';

// accrualKind is an open ERP string stored as reference data, never a closed enum.
// Applies `retro-bonus-rule` into RetroBonusRule — pure upsert, no tombstone branch (unlike
// every other handler in this plugin): this stream never sends one.
@Injectable()
export class RetroBonusRuleStreamHandler implements BatchInboundStreamHandler {
    constructor(private readonly retroBonusRuleService: RetroBonusRuleService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const input = parseRetroBonusRule(entityId, payload);
        await this.retroBonusRuleService.upsertRetroBonusRule(ctx, input);
        Logger.verbose(
            `Upserted retro-bonus rule erpId=${entityId} counterparty=${input.counterpartyErpId} ` +
                `product=${input.productErpId} accrualKind=${input.accrualKind}`,
            loggerCtx,
        );
        return inboundApplied();
    }

    async applyBatch(
        ctx: RequestContext,
        items: BatchInboundItem[],
    ): Promise<BatchInboundResult[]> {
        const results: BatchInboundResult[] = [];
        const inputs: RetroBonusRuleUpsertInput[] = [];
        for (const item of items) {
            try {
                inputs.push(parseRetroBonusRule(item.entityId, item.payload));
                results.push(inboundApplied());
            } catch (err) {
                if (!(err instanceof NonRetryableInboundError)) throw err;
                results.push({ kind: 'invalid', error: err });
            }
        }
        await this.retroBonusRuleService.upsertBatch(ctx, inputs);
        return results;
    }
}
