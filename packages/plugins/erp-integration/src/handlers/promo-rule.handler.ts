import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { PromoDiscountRuleService, DiscountRuleOperationKind } from '@mivend/plugin-price-entry';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationPromoRuleHandler';

// The four raw 1C `operation_kind` values PromoRuleChanged.proto documents (a closed 1C enum,
// carried as a plain string on the wire — see the field's own proto comment: "new values can
// appear without a schema change", so an unrecognized value below is treated as a malformed
// payload, not silently coerced). See DiscountRule's own doc comment for percent-type vs.
// gift-type.
const RAW_OPERATION_KIND_TO_KIND: Record<string, DiscountRuleOperationKind> = {
    ПроцентСкидки: 'percent-discount',
    Скидка20НаВсе: 'percent-discount',
    ОдинПодарокИзСписка: 'gift-one-from-list',
    ВсеПодаркиИзСписка: 'gift-all-from-list',
};

function isGiftKind(kind: DiscountRuleOperationKind): boolean {
    return kind === 'gift-one-from-list' || kind === 'gift-all-from-list';
}

// A gift-type promo rule ("get gift_product_id free") is represented on DiscountRule as a
// near-100% discount on the gift product's own line — the business's own "for one kopeck" mental
// model (see issue #107) — approximated to the nearest integer percent DiscountRule.percent (an
// `int` column) can represent. Not a literal 100% (free) — the business explicitly wants a
// non-zero charge, however nominal.
const GIFT_TYPE_PERCENT = 99;

// Applies Integration Service's `promo-rule` stream (PromoRuleChanged) — feeds
// @mivend/plugin-price-entry's DiscountRule via PromoDiscountRuleService.upsertPromoRule, the
// same entity the existing facet/priceType-threshold discount mechanism uses (product decision,
// issue #107: not a separate promo mechanism).
//
// Full current field list (event-contracts@0.38.0, PromoRuleChanged) and each field's outcome —
// see the external-integration-rules skill's mandatory checklist:
//   event_id            — not consumed (inbox already dedupes by its own (stream, entityId,
//                          version); no local use for the 1C-side event id itself).
//   occurred_at          — not consumed (no local field tracks 1C's own event timestamp; updated_at
//                          below already serves as the record's own last-change marker).
//   entity_id            — consumed (handler `entityId` param = DiscountRule.erpId).
//   version              — consumed by IntegrationInboxProcessorService's own out-of-order guard,
//                          upstream of this handler; not read again here.
//   updated_at           — not consumed (VendureEntity.updatedAt already tracks local upsert time;
//                          no feature currently needs 1C's own updated_at distinct from that).
//   source_document_id  — not consumed (no local field for "which 1C document created this rule";
//                          nothing currently needs to trace a promo rule back to a specific 1C
//                          document — see the erpId itself for cross-system reconciliation).
//   trigger_product_id  — consumed -> DiscountRule.triggerProductErpId.
//   trigger_quantity     — consumed -> DiscountRule.triggerQuantity.
//   warehouse_id         — not consumed. DiscountRule carries no warehouse scoping and no current
//                          mivend feature needs a promo rule limited to one warehouse; deferred
//                          until a real warehouse-scoped promo requirement exists.
//   gift_product_id      — consumed -> DiscountRule.giftProductErpId (null for percent-type).
//   gift_quantity         — consumed -> DiscountRule.giftQuantity (0 for percent-type).
//   percent               — consumed -> DiscountRule.percent for percent-type rules; gift-type
//                          rules use GIFT_TYPE_PERCENT instead (see its own comment above) since
//                          the business decision is "near-free", not whatever raw percent 1C sends
//                          for a gift rule (0 per the proto's own field comment).
//   operation_kind        — consumed -> DiscountRule.operationKind (mapped via
//                          RAW_OPERATION_KIND_TO_KIND, never stored raw).
//   min_positions_count  — not consumed. Distinct metric from DiscountRule's existing
//                          minWeightKg/minAmount (a *count* of order positions, not weight/money) —
//                          no current mivend discount-application path evaluates a "distinct SKU
//                          count" threshold; deferred until that mechanic is actually needed.
//   effective_from        — consumed -> DiscountRule.validFrom.
//   effective_to          — consumed -> DiscountRule.validTo.
//   is_active             — consumed (absent means false — proto3 zero-value omission, see
//                          types.ts's InboundStream comment).
//   is_deleted            — consumed (always false per the field's own proto comment; read anyway
//                          for envelope consistency with every other handler).
@Injectable()
export class PromoRuleStreamHandler implements InboundStreamHandler {
    constructor(private readonly promoDiscountRuleService: PromoDiscountRuleService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const isActive = payload.isActive === true;
        const isDeleted = payload.isDeleted === true;
        if (!isActive || isDeleted) {
            Logger.verbose(`promo-rule ${entityId}: inactive/deleted, skipping`, loggerCtx);
            return;
        }

        const rawOperationKind = String(payload.operationKind ?? '');
        const operationKind = RAW_OPERATION_KIND_TO_KIND[rawOperationKind];
        if (!operationKind) {
            Logger.warn(
                `promo-rule ${entityId}: unrecognized operationKind "${rawOperationKind}", skipping`,
                loggerCtx,
            );
            return;
        }

        const triggerProductErpId = String(payload.triggerProductId ?? '');
        const triggerQuantity = Number(payload.triggerQuantity ?? 0);
        const effectiveFrom = parseTimestamp(payload.effectiveFrom);
        const effectiveTo = parseTimestamp(payload.effectiveTo);
        if (!triggerProductErpId || triggerQuantity <= 0 || !effectiveFrom || !effectiveTo) {
            Logger.warn(
                `promo-rule ${entityId}: missing triggerProductId/triggerQuantity/effectiveFrom/effectiveTo, skipping`,
                loggerCtx,
            );
            return;
        }

        const gift = isGiftKind(operationKind);
        const giftProductErpId = gift ? String(payload.giftProductId ?? '') || null : null;
        const giftQuantity = gift ? Number(payload.giftQuantity ?? 0) : null;
        if (gift && (!giftProductErpId || !giftQuantity || giftQuantity <= 0)) {
            Logger.warn(
                `promo-rule ${entityId}: gift-type rule missing giftProductId/giftQuantity, skipping`,
                loggerCtx,
            );
            return;
        }
        const percent = gift ? GIFT_TYPE_PERCENT : Number(payload.percent ?? 0);

        await this.promoDiscountRuleService.upsertPromoRule(ctx, {
            erpId: entityId,
            percent,
            validFrom: effectiveFrom,
            validTo: effectiveTo,
            triggerProductErpId,
            triggerQuantity,
            giftProductErpId,
            giftQuantity,
            operationKind,
        });
        Logger.verbose(
            `Upserted promo rule erpId=${entityId} kind=${operationKind} triggerProductErpId=${triggerProductErpId}`,
            loggerCtx,
        );
    }
}

// google.protobuf.Timestamp fields are encoded by @bufbuild/protobuf's toJson (the well-known-type
// JSON mapping) as an RFC3339 string, e.g. "2026-01-01T00:00:00Z" — never a {seconds,nanos} object
// at this layer (that shape only exists in the protobuf binary/JS object form, before toJson).
function parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
