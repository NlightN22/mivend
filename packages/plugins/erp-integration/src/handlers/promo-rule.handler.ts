import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { PromoDiscountRuleService, DiscountRuleOperationKind } from '@mivend/plugin-price-entry';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { optionalString, parseTimestamp, zeroNumber } from './proto-json-fields';

const loggerCtx = 'IntegrationPromoRuleHandler';

// operation_kind is an open ERP string: unknown values must fail as malformed, not be coerced
const RAW_OPERATION_KIND_TO_KIND: Record<string, DiscountRuleOperationKind> = {
    ПроцентСкидки: 'percent-discount',
    Скидка20НаВсе: 'percent-discount',
    ОдинПодарокИзСписка: 'gift-one-from-list',
    ВсеПодаркиИзСписка: 'gift-all-from-list',
};

function isGiftKind(kind: DiscountRuleOperationKind): boolean {
    return kind === 'gift-one-from-list' || kind === 'gift-all-from-list';
}

// Gift rules map to a near-100 int percent, never 100: the business wants a nominal non-zero charge
const GIFT_TYPE_PERCENT = 99;

// Absent effective_to is stored as NULL (open-ended) and is never applied: queries keep validTo >= now.
// Reuses DiscountRule, not a new promo mechanism. warehouse_id, min_positions_count deferred
// Absent is_active means inactive on purpose; event_id/version are guarded upstream by the inbox.
@Injectable()
export class PromoRuleStreamHandler implements InboundStreamHandler {
    constructor(private readonly promoDiscountRuleService: PromoDiscountRuleService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const isActive = payload.isActive === true;
        const isDeleted = payload.isDeleted === true;
        if (!isActive || isDeleted) {
            return inboundNoop(`promo-rule ${entityId}: inactive/deleted, skipping`);
        }

        const rawOperationKind = String(payload.operationKind ?? '');
        const operationKind = RAW_OPERATION_KIND_TO_KIND[rawOperationKind];
        if (!operationKind) {
            return inboundNoop(
                `promo-rule ${entityId}: unrecognized operationKind "${rawOperationKind}", skipping`,
            );
        }

        const triggerProductErpId = String(payload.triggerProductId ?? '');
        const triggerQuantity = zeroNumber(payload.triggerQuantity);
        const effectiveFrom = parseTimestamp(payload.effectiveFrom);
        const hasEffectiveTo = optionalString(payload.effectiveTo) !== null;
        const effectiveTo = hasEffectiveTo ? parseTimestamp(payload.effectiveTo) : null;
        const gift = isGiftKind(operationKind);
        const giftProductErpId = gift ? optionalString(payload.giftProductId) : null;
        const giftQuantity = gift ? zeroNumber(payload.giftQuantity) : null;
        const payloadPercent = zeroNumber(payload.percent);
        const invalid =
            (!triggerProductErpId && 'triggerProductId') ||
            (!(triggerQuantity > 0) && 'triggerQuantity') ||
            (!Number.isFinite(payloadPercent) && 'percent') ||
            (!effectiveFrom && 'effectiveFrom') ||
            (hasEffectiveTo && !effectiveTo && 'effectiveTo') ||
            (gift && !giftProductErpId && 'giftProductId') ||
            (gift && !(giftQuantity !== null && giftQuantity > 0) && 'giftQuantity');
        if (invalid || !effectiveFrom) {
            throw new NonRetryableInboundError(
                `promo-rule ${entityId}: invalid or missing ${String(invalid)}`,
            );
        }
        const percent = gift ? GIFT_TYPE_PERCENT : payloadPercent;

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
        return inboundApplied();
    }
}
