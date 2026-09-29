import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import {
    CounterpartyDiscountRuleService,
    DiscountRuleCondition,
    DiscountRuleRecipientType,
} from '@mivend/plugin-price-entry';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationDiscountRuleHandler';

// Confirmed live against integration-service source (discount-rule.dto.ts) via search-platform —
// see issue #108's own comment: closed TS union, exactly these 2 values, not a raw 1C passthrough.
const VALID_RECIPIENT_TYPES: readonly DiscountRuleRecipientType[] = ['counterparty', 'contract'];
const VALID_CONDITIONS: readonly DiscountRuleCondition[] = ['byQuantity', 'byDocumentAmount'];

// Applies Integration Service's `discount-rule` stream (DiscountRuleChanged, entityId = the ERP's
// own discount rule id) — feeds @mivend/plugin-price-entry's DiscountRule via
// CounterpartyDiscountRuleService.upsertCounterpartyRule, the same entity the existing
// facet/priceType-threshold and #107 promo rules use (project-owner decision, issue #108: one
// entity, two write channels — not a separate rule system).
//
// Full field list (@nlightn22/event-contracts@0.43.0, DiscountRuleChanged) and each field's
// outcome — see the external-integration-rules skill's mandatory checklist:
//   event_id        — not consumed (inbox already dedupes by its own (stream, entityId, version)).
//   occurred_at      — not consumed (updatedAt/VendureEntity already tracks local upsert time).
//   entity_id        — consumed (handler `entityId` param = DiscountRule.erpId).
//   version          — consumed twice: IntegrationInboxProcessorService's own out-of-order guard
//                      upstream of this handler (per-erpId ordering), AND read again here into
//                      DiscountRule.sourceVersion — CounterpartyDiscountRuleService's own
//                      cross-entity conflict resolution needs it to compare two *different*
//                      erpIds targeting the same recipient+product scope, which the upstream
//                      per-erpId guard cannot do.
//   updated_at       — not consumed (same reasoning as promo-rule.handler.ts).
//   product_id       — consumed -> DiscountRule.productErpId (null = applies to all nomenclature
//                      for this recipient, per the field's own proto comment).
//   recipient_type   — consumed -> DiscountRule.recipientType, validated against the closed
//                      2-value set; an unrecognized value is rejected, not silently coerced.
//   recipient_id     — consumed -> DiscountRule.recipientErpId.
//   condition        — consumed -> DiscountRule.condition, validated against the closed 2-value
//                      set confirmed live (see this file's own comment above).
//   condition_value  — consumed -> DiscountRule.conditionValue.
//   percent          — consumed -> DiscountRule.percent.
//   limit_amount     — consumed -> DiscountRule.limitAmount (captured, not yet enforced in price
//                      computation — see issue #108's test plan "Deliberate omissions").
//   effective_from   — consumed -> DiscountRule.validFrom.
//   effective_to     — consumed -> DiscountRule.validTo (real optional; absence treated as
//                      "no expiry" is NOT assumed here — see the missing-field guard below,
//                      matching promo-rule.handler.ts's own conservative treatment of a required
//                      window).
//   is_active        — consumed; `payload.isActive === true` only (see types.ts's own doc comment
//                      on why an absent key must never default to active).
//   is_deleted       — consumed (always false per the field's own proto comment; read anyway for
//                      envelope consistency with every other handler).
@Injectable()
export class DiscountRuleStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly counterpartyDiscountRuleService: CounterpartyDiscountRuleService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const isActive = payload.isActive === true;
        const isDeleted = payload.isDeleted === true;
        if (!isActive || isDeleted) {
            Logger.verbose(`discount-rule ${entityId}: inactive/deleted, skipping`, loggerCtx);
            return;
        }

        const recipientType = String(payload.recipientType ?? '') as DiscountRuleRecipientType;
        if (!VALID_RECIPIENT_TYPES.includes(recipientType)) {
            Logger.warn(
                `discount-rule ${entityId}: unrecognized recipientType "${String(payload.recipientType)}", skipping`,
                loggerCtx,
            );
            return;
        }

        const condition = String(payload.condition ?? '') as DiscountRuleCondition;
        if (!VALID_CONDITIONS.includes(condition)) {
            Logger.warn(
                `discount-rule ${entityId}: unrecognized condition "${String(payload.condition)}", skipping`,
                loggerCtx,
            );
            return;
        }

        const recipientErpId = String(payload.recipientId ?? '');
        const conditionValue = Number(payload.conditionValue ?? NaN);
        const percent = Number(payload.percent ?? NaN);
        const version = String(payload.version ?? '');
        const effectiveFrom = parseTimestamp(payload.effectiveFrom);
        const effectiveTo = parseTimestamp(payload.effectiveTo);
        if (
            !recipientErpId ||
            !version ||
            !Number.isFinite(conditionValue) ||
            !Number.isFinite(percent) ||
            !effectiveFrom ||
            !effectiveTo
        ) {
            Logger.warn(
                `discount-rule ${entityId}: missing recipientId/version/conditionValue/percent/` +
                    `effectiveFrom/effectiveTo, skipping`,
                loggerCtx,
            );
            return;
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
