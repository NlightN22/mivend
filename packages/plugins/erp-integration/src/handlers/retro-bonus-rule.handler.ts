import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { RetroBonusAccrualKind, RetroBonusRuleService } from '@mivend/plugin-retro-bonus';

import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationRetroBonusRuleHandler';

// Confirmed live by search-platform#126: closed TS union, exactly these 4 raw Cyrillic values —
// see RetroBonusRule.accrualKind's own doc comment for why they're stored raw, not translated.
const VALID_ACCRUAL_KINDS: readonly RetroBonusAccrualKind[] = [
    'ПоЗакупкам',
    'ПоПоступлениюДС',
    'ПоПоступлениюДССБК',
    'ПоПродажам',
];

// Applies `retro-bonus-rule` into RetroBonusRule — pure upsert, no tombstone branch (unlike
// every other handler in this plugin): this stream never sends one, see issue #102.
@Injectable()
export class RetroBonusRuleStreamHandler implements InboundStreamHandler {
    constructor(private readonly retroBonusRuleService: RetroBonusRuleService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome | void> {
        const accrualKind = String(payload.accrualKind ?? '') as RetroBonusAccrualKind;
        if (!VALID_ACCRUAL_KINDS.includes(accrualKind)) {
            return inboundNoop(
                `retro-bonus-rule ${entityId}: unrecognized accrualKind "${String(payload.accrualKind)}", skipping`,
            );
        }

        const version = String(payload.version ?? '');
        const productErpId = String(payload.productId ?? '');
        const counterpartyErpId = String(payload.counterpartyId ?? '');
        const percent = Number(payload.percent ?? NaN);
        const effectiveFrom = parseTimestamp(payload.effectiveFrom);
        // Real optional presence — absence means no expiry; present-but-unparseable is malformed.
        const effectiveToPresent = payload.effectiveTo != null;
        const effectiveTo = effectiveToPresent ? parseTimestamp(payload.effectiveTo) : null;
        if (
            !entityId ||
            !version ||
            !productErpId ||
            !counterpartyErpId ||
            !Number.isFinite(percent) ||
            !effectiveFrom ||
            (effectiveToPresent && !effectiveTo)
        ) {
            return inboundNoop(
                `retro-bonus-rule ${entityId}: missing/invalid entityId/version/productId/` +
                    `counterpartyId/percent/effectiveFrom/effectiveTo, skipping`,
            );
        }

        const recipientContractErpId =
            payload.recipientContractId != null ? String(payload.recipientContractId) : null;
        const priceTypeErpId = payload.priceTypeId != null ? String(payload.priceTypeId) : null;
        // Zero-coercion fields — absence reads as false/0, never "was this field actually sent".
        const isInstant = payload.isInstant === true;
        const accrualDayNumber = Number(payload.accrualDayNumber ?? 0);
        const accrualPeriod = payload.accrualPeriod != null ? String(payload.accrualPeriod) : null;
        const limitAmount = payload.limitAmount != null ? Number(payload.limitAmount) : null;
        const conditionAmount =
            payload.conditionAmount != null ? Number(payload.conditionAmount) : null;
        const conditionQuantity =
            payload.conditionQuantity != null ? Number(payload.conditionQuantity) : null;

        await this.retroBonusRuleService.upsertRetroBonusRule(ctx, {
            erpId: entityId,
            productErpId,
            counterpartyErpId,
            recipientContractErpId,
            priceTypeErpId,
            isInstant,
            accrualPeriod,
            accrualDayNumber,
            accrualKind,
            percent,
            limitAmount,
            conditionAmount,
            conditionQuantity,
            validFrom: effectiveFrom,
            validTo: effectiveTo,
            sourceVersion: version,
        });
        Logger.verbose(
            `Upserted retro-bonus rule erpId=${entityId} counterparty=${counterpartyErpId} ` +
                `product=${productErpId} accrualKind=${accrualKind}`,
            loggerCtx,
        );
    }
}

// google.protobuf.Timestamp fields are encoded by @bufbuild/protobuf's toJson as an RFC3339
// string — see discount-rule.handler.ts's own identical helper/comment.
function parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
