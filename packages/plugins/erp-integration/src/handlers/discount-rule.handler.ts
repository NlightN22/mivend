import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import {
    CounterpartyDiscountRuleService,
    DiscountRuleCondition,
    DiscountRuleRecipientType,
} from '@mivend/plugin-price-entry';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { optionalNumber, optionalString, parseTimestamp, zeroNumber } from './proto-json-fields';

const loggerCtx = 'IntegrationDiscountRuleHandler';

// Closed sets: any other value is a contract break, not reference data.
const VALID_RECIPIENT_TYPES: readonly DiscountRuleRecipientType[] = ['counterparty', 'contract'];
const VALID_CONDITIONS: readonly DiscountRuleCondition[] = ['byQuantity', 'byDocumentAmount'];

// Applies the `discount-rule` stream into @mivend/plugin-price-entry's DiscountRule — full field
// accounting and conflict policy: docs/ai/erp-streams-map.md.
@Injectable()
export class DiscountRuleStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly counterpartyDiscountRuleService: CounterpartyDiscountRuleService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        // Tombstone — deactivate, never skip. version is stored too: see
        // docs/ai/erp-streams-map.md's "Discount rules" section for the reactivation-race reasoning.
        if (payload.isDeleted === true) {
            const matched = await this.counterpartyDiscountRuleService.deactivateTombstone(
                ctx,
                entityId,
                String(payload.version ?? ''),
            );
            Logger.verbose(
                `discount-rule ${entityId}: tombstone — deactivated if a row existed`,
                loggerCtx,
            );
            return matched
                ? inboundApplied()
                : inboundNoop(`discount-rule ${entityId}: tombstone for an unknown rule`);
        }
        if (payload.isActive !== true) {
            return inboundNoop(`discount-rule ${entityId}: inactive, skipping`);
        }

        const recipientType = String(payload.recipientType ?? '') as DiscountRuleRecipientType;
        const condition = String(payload.condition ?? '') as DiscountRuleCondition;
        const recipientErpId = String(payload.recipientId ?? '');
        const conditionValue = zeroNumber(payload.conditionValue);
        const percent = zeroNumber(payload.percent);
        const version = String(payload.version ?? '');
        const effectiveFrom = parseTimestamp(payload.effectiveFrom);
        const effectiveTo = optionalString(payload.effectiveTo)
            ? parseTimestamp(payload.effectiveTo)
            : null;
        const invalid =
            (!VALID_RECIPIENT_TYPES.includes(recipientType) && 'recipientType') ||
            (!VALID_CONDITIONS.includes(condition) && 'condition') ||
            (!recipientErpId && 'recipientId') ||
            (!version && 'version') ||
            (!Number.isFinite(conditionValue) && 'conditionValue') ||
            (!Number.isFinite(percent) && 'percent') ||
            (!effectiveFrom && 'effectiveFrom') ||
            (optionalString(payload.effectiveTo) && !effectiveTo && 'effectiveTo');
        if (invalid || !effectiveFrom) {
            throw new NonRetryableInboundError(
                `discount-rule ${entityId}: invalid or missing ${String(invalid)}`,
            );
        }

        const productErpId = optionalString(payload.productId);
        const limitAmount = optionalNumber(payload.limitAmount);

        await this.counterpartyDiscountRuleService.upsertCounterpartyRule(ctx, {
            erpId: entityId,
            recipientType,
            recipientErpId,
            productErpId,
            condition,
            conditionValue,
            percent,
            limitAmount,
            validFrom: effectiveFrom,
            validTo: effectiveTo,
            sourceVersion: version,
        });
        Logger.verbose(
            `Upserted discount rule erpId=${entityId} recipient=${recipientType}/${recipientErpId} ` +
                `product=${productErpId ?? 'all'}`,
            loggerCtx,
        );
        return inboundApplied();
    }
}
