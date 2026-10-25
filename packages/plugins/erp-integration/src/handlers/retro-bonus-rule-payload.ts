import type { RetroBonusRuleUpsertInput } from '@mivend/plugin-retro-bonus';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { optionalNumber, optionalString, parseTimestamp, zeroNumber } from './proto-json-fields';

export function parseRetroBonusRule(
    entityId: string,
    payload: Record<string, unknown>,
): RetroBonusRuleUpsertInput {
    const accrualKind = String(payload.accrualKind ?? '');
    const version = String(payload.version ?? '');
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
    return {
        erpId: entityId,
        productErpId: String(payload.productId ?? ''),
        counterpartyErpId,
        recipientContractErpId: optionalString(payload.recipientContractId),
        priceTypeErpId: optionalString(payload.priceTypeId),
        isInstant: payload.isInstant === true,
        accrualPeriod: optionalString(payload.accrualPeriod),
        accrualDayNumber,
        accrualKind,
        percent,
        limitAmount: optionalNumber(payload.limitAmount),
        conditionAmount: optionalNumber(payload.conditionAmount),
        conditionQuantity: optionalNumber(payload.conditionQuantity),
        validFrom: effectiveFrom,
        validTo: effectiveTo,
        sourceVersion: version,
    };
}
