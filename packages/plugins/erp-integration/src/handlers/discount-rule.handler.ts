import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import {
    CounterpartyDiscountRuleService,
    DiscountRuleCondition,
    DiscountRuleRecipientType,
} from '@mivend/plugin-price-entry';

import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationDiscountRuleHandler';

// Confirmed live against integration-service source (discount-rule.dto.ts) via search-platform —
// see issue #108's own comment: closed TS union, exactly these 2 values, not a raw 1C passthrough.
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
    ): Promise<InboundOutcome | void> {
        // Tombstone (search-platform#145) — deactivate, never skip. version is stored too: see
        // docs/ai/erp-streams-map.md's "Discount rules" section for the reactivation-race reasoning.
        if (payload.isDeleted === true) {
            await this.counterpartyDiscountRuleService.deactivateTombstone(
                ctx,
                entityId,
                String(payload.version ?? ''),
            );
            Logger.verbose(
                `discount-rule ${entityId}: tombstone — deactivated if a row existed`,
                loggerCtx,
            );
            return;
        }
        if (payload.isActive !== true) {
            return inboundNoop(`discount-rule ${entityId}: inactive, skipping`);
        }

        const recipientType = String(payload.recipientType ?? '') as DiscountRuleRecipientType;
        if (!VALID_RECIPIENT_TYPES.includes(recipientType)) {
            return inboundNoop(
                `discount-rule ${entityId}: unrecognized recipientType "${String(payload.recipientType)}", skipping`,
            );
        }

        const condition = String(payload.condition ?? '') as DiscountRuleCondition;
        if (!VALID_CONDITIONS.includes(condition)) {
            return inboundNoop(
                `discount-rule ${entityId}: unrecognized condition "${String(payload.condition)}", skipping`,
            );
        }

        const recipientErpId = String(payload.recipientId ?? '');
        const conditionValue = Number(payload.conditionValue ?? NaN);
        const percent = Number(payload.percent ?? NaN);
        const version = String(payload.version ?? '');
        const effectiveFrom = parseTimestamp(payload.effectiveFrom);
        // Real optional presence — absence means no expiry (docs/ai/erp-streams-map.md), a
        // present-but-unparseable value is still malformed and skipped below.
        const effectiveToPresent = payload.effectiveTo != null;
        const effectiveTo = effectiveToPresent ? parseTimestamp(payload.effectiveTo) : null;
        if (
            !recipientErpId ||
            !version ||
            !Number.isFinite(conditionValue) ||
            !Number.isFinite(percent) ||
            !effectiveFrom ||
            (effectiveToPresent && !effectiveTo)
        ) {
            return inboundNoop(
                `discount-rule ${entityId}: missing/invalid recipientId/version/conditionValue/` +
                    `percent/effectiveFrom/effectiveTo, skipping`,
            );
        }

        const productErpId = payload.productId != null ? String(payload.productId) : null;
        const limitAmount = payload.limitAmount != null ? Number(payload.limitAmount) : null;

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
    }
}

// google.protobuf.Timestamp fields are encoded by @bufbuild/protobuf's toJson as an RFC3339
// string — see promo-rule.handler.ts's own identical helper/comment.
function parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
