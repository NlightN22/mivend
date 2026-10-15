import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { PromoDiscountRuleService, DiscountRuleOperationKind } from '@mivend/plugin-price-entry';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

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
        const triggerQuantity = Number(payload.triggerQuantity ?? 0);
        const effectiveFrom = parseTimestamp(payload.effectiveFrom);
        const effectiveTo = parseTimestamp(payload.effectiveTo);
        if (!triggerProductErpId || triggerQuantity <= 0 || !effectiveFrom || !effectiveTo) {
            return inboundNoop(
                `promo-rule ${entityId}: missing triggerProductId/triggerQuantity/effectiveFrom/effectiveTo, skipping`,
            );
        }

        const gift = isGiftKind(operationKind);
        const giftProductErpId = gift ? String(payload.giftProductId ?? '') || null : null;
        const giftQuantity = gift ? Number(payload.giftQuantity ?? 0) : null;
        if (gift && (!giftProductErpId || !giftQuantity || giftQuantity <= 0)) {
            return inboundNoop(
                `promo-rule ${entityId}: gift-type rule missing giftProductId/giftQuantity, skipping`,
            );
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
        return inboundApplied();
    }
}

// toJson encodes Timestamp as an RFC3339 string here, never a {seconds,nanos} object
function parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
