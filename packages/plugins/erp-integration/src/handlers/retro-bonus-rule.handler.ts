import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { RetroBonusRuleService } from '@mivend/plugin-retro-bonus';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { inboundApplied } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';
import { optionalNumber, optionalString, parseTimestamp, zeroNumber } from './proto-json-fields';

const loggerCtx = 'IntegrationRetroBonusRuleHandler';

// accrualKind is an open ERP string stored as reference data, never a closed enum.
// Applies `retro-bonus-rule` into RetroBonusRule — pure upsert, no tombstone branch (unlike
// every other handler in this plugin): this stream never sends one.
@Injectable()
export class RetroBonusRuleStreamHandler implements InboundStreamHandler {
    constructor(private readonly retroBonusRuleService: RetroBonusRuleService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const accrualKind = String(payload.accrualKind ?? '');
        const version = String(payload.version ?? '');
        const productErpId = String(payload.productId ?? '');
        const counterpartyErpId = String(payload.counterpartyId ?? '');
        const percent = zeroNumber(payload.percent);
        const accrualDayNumber = zeroNumber(payload.accrualDayNumber);
        const effectiveFrom = parseTimestamp(payload.effectiveFrom);
        const effectiveTo = optionalString(payload.effectiveTo)
            ? parseTimestamp(payload.effectiveTo)
            : null;
        const invalid =
            (!entityId && 'entityId') ||
            (!version && 'version') ||
            (!counterpartyErpId && 'counterpartyId') ||
            (!Number.isFinite(percent) && 'percent') ||
            (!Number.isFinite(accrualDayNumber) && 'accrualDayNumber') ||
            (!effectiveFrom && 'effectiveFrom') ||
            (optionalString(payload.effectiveTo) && !effectiveTo && 'effectiveTo');
        if (invalid || !effectiveFrom) {
            throw new NonRetryableInboundError(
                `retro-bonus-rule ${entityId}: invalid or missing ${String(invalid)}`,
            );
        }

        const recipientContractErpId = optionalString(payload.recipientContractId);
        const priceTypeErpId = optionalString(payload.priceTypeId);
        const isInstant = payload.isInstant === true;
        const accrualPeriod = optionalString(payload.accrualPeriod);
        const limitAmount = optionalNumber(payload.limitAmount);
        const conditionAmount = optionalNumber(payload.conditionAmount);
        const conditionQuantity = optionalNumber(payload.conditionQuantity);

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
        return inboundApplied();
    }
}
