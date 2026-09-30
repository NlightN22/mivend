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

// Applies Integration Service's `discount-rule` stream (DiscountRuleChanged) — feeds
// @mivend/plugin-price-entry's DiscountRule via CounterpartyDiscountRuleService, the same entity
// facet/priceType and #107 promo rules use. Full field accounting, the write-time conflict policy,
// and a known reconciliation gap (this contract's is_active can never signal a real cancellation)
// are documented in docs/ai/erp-streams-map.md's "Discount rules" section — read that before
// changing this handler, not just this file.
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
        // Real optional presence (proto3 `optional Timestamp`) — absence means no expiry, never
        // required the way promo-rule.handler.ts's own effective_to is (a different, non-optional
        // field on that contract). A present-but-unparseable value is still malformed, not "no
        // expiry" — skipped the same as any other bad field below.
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
            Logger.warn(
                `discount-rule ${entityId}: missing/invalid recipientId/version/conditionValue/` +
                    `percent/effectiveFrom/effectiveTo, skipping`,
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
