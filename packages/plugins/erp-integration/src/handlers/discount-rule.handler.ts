import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { CounterpartyDiscountRuleService } from '@mivend/plugin-price-entry';
import type { CounterpartyRuleBatchOp } from '@mivend/plugin-price-entry';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { parseDiscountRule } from './discount-rule-payload';
import type { ParsedDiscountRule } from './discount-rule-payload';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type {
    BatchInboundItem,
    BatchInboundResult,
    BatchInboundStreamHandler,
    InboundOutcome,
} from './inbound-stream-handler';

const loggerCtx = 'IntegrationDiscountRuleHandler';

const unknownTombstone = (entityId: string): InboundOutcome =>
    inboundNoop(`discount-rule ${entityId}: tombstone for an unknown rule`);

// Applies the `discount-rule` stream into @mivend/plugin-price-entry's DiscountRule — full field
// accounting and conflict policy: docs/ai/erp-streams-map.md.
@Injectable()
export class DiscountRuleStreamHandler implements BatchInboundStreamHandler {
    constructor(
        private readonly counterpartyDiscountRuleService: CounterpartyDiscountRuleService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const parsed = parseDiscountRule(entityId, payload);
        // Tombstone — deactivate, never skip. version is stored too: see
        // docs/ai/erp-streams-map.md's "Discount rules" section for the reactivation-race reasoning.
        if (parsed.kind === 'tombstone') {
            const matched = await this.counterpartyDiscountRuleService.deactivateTombstone(
                ctx,
                entityId,
                parsed.version,
            );
            Logger.verbose(
                `discount-rule ${entityId}: tombstone — deactivated if a row existed`,
                loggerCtx,
            );
            return matched ? inboundApplied() : unknownTombstone(entityId);
        }
        if (parsed.kind === 'inactive') {
            return inboundNoop(`discount-rule ${entityId}: inactive, skipping`);
        }
        await this.counterpartyDiscountRuleService.upsertCounterpartyRule(ctx, parsed.input);
        Logger.verbose(
            `Upserted discount rule erpId=${entityId} recipient=${parsed.input.recipientType}/${parsed.input.recipientErpId} ` +
                `product=${parsed.input.productErpId ?? 'all'}`,
            loggerCtx,
        );
        return inboundApplied();
    }

    async applyBatch(
        ctx: RequestContext,
        items: BatchInboundItem[],
    ): Promise<BatchInboundResult[]> {
        const results: Array<BatchInboundResult | null> = items.map(() => null);
        const ops: CounterpartyRuleBatchOp[] = [];
        const opIndex: number[] = [];
        items.forEach((item, i) => {
            let parsed: ParsedDiscountRule;
            try {
                parsed = parseDiscountRule(item.entityId, item.payload);
            } catch (err) {
                if (!(err instanceof NonRetryableInboundError)) throw err;
                results[i] = { kind: 'invalid', error: err };
                return;
            }
            if (parsed.kind === 'inactive') {
                results[i] = inboundNoop(`discount-rule ${item.entityId}: inactive, skipping`);
                return;
            }
            ops.push(
                parsed.kind === 'tombstone'
                    ? { kind: 'tombstone', erpId: item.entityId, version: parsed.version }
                    : { kind: 'upsert', input: parsed.input },
            );
            opIndex.push(i);
        });
        const matched = await this.counterpartyDiscountRuleService.applyBatch(ctx, ops);
        ops.forEach((op, j) => {
            const i = opIndex[j];
            results[i] =
                op.kind === 'tombstone' && !matched[j]
                    ? unknownTombstone(items[i].entityId)
                    : inboundApplied();
        });
        return results as BatchInboundResult[];
    }
}
