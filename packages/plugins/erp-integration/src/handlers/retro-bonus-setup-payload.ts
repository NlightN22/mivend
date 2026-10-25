import type { RetroBonusSetupInput } from '@mivend/plugin-retro-bonus';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { optionalNumber, optionalString, parseTimestamp, zeroNumber } from './proto-json-fields';
import { parseSelectionFilter, parseSelectionMode, stringList } from './selection-payload';

export type ParsedRetroBonusSetup =
    | { kind: 'tombstone'; version: string }
    | { kind: 'inactive'; version: string }
    | { kind: 'upsert'; input: RetroBonusSetupInput };

// Field accounting (consumed vs deferred, event-contracts 0.82.0): docs/ai/erp-streams-map.md
// "Discount and retro-bonus setup documents".
export function parseRetroBonusSetup(
    entityId: string,
    payload: Record<string, unknown>,
): ParsedRetroBonusSetup {
    const version = String(payload.version ?? '');
    if (payload.isDeleted === true) return { kind: 'tombstone', version };
    if (payload.isActive !== true) return { kind: 'inactive', version };

    const percent = zeroNumber(payload.percent);
    const accrualDayNumber = zeroNumber(payload.accrualDayNumber);
    const validFrom = parseTimestamp(payload.effectiveFrom);
    const validTo = optionalString(payload.effectiveTo)
        ? parseTimestamp(payload.effectiveTo)
        : null;
    const counterpartyMode = parseSelectionMode(payload.counterpartyMode);
    const productMode = parseSelectionMode(payload.productMode);
    const invalid =
        (!entityId && 'entityId') ||
        (!version && 'version') ||
        (!Number.isFinite(percent) && 'percent') ||
        (!Number.isFinite(accrualDayNumber) && 'accrualDayNumber') ||
        (!validFrom && 'effectiveFrom') ||
        (optionalString(payload.effectiveTo) && !validTo && 'effectiveTo') ||
        (!counterpartyMode && 'counterpartyMode') ||
        (!productMode && 'productMode');
    if (invalid || !validFrom || !counterpartyMode || !productMode) {
        throw new NonRetryableInboundError(
            `retro-bonus-setup ${entityId}: invalid or missing ${String(invalid)}`,
        );
    }
    return {
        kind: 'upsert',
        input: {
            rule: {
                erpId: entityId,
                documentNumber: String(payload.documentNumber ?? ''),
                isInstant: payload.isInstant === true,
                accrualPeriod: optionalString(payload.accrualPeriod),
                accrualDayNumber,
                accrualKind: String(payload.accrualKind ?? ''),
                percent,
                conditionAmount: optionalNumber(payload.conditionAmount),
                conditionQuantity: optionalNumber(payload.conditionQuantity),
                priceTypeErpId: optionalString(payload.priceTypeId),
                organizationErpId: optionalString(payload.organizationId),
                recipientCounterpartyErpId: optionalString(payload.recipientCounterpartyId),
                recipientContractErpId: optionalString(payload.recipientContractId),
                validFrom,
                validTo,
                allCounterparties: payload.allCounterparties === true,
                allProducts: payload.allProducts === true,
                counterpartyMode,
                productMode,
                counterpartyFilter: parseSelectionFilter(payload.counterpartyFilter),
                productFilter: parseSelectionFilter(payload.productFilter),
                sourceVersion: version,
            },
            counterpartyErpIds: stringList(payload.counterpartyIds),
            productErpIds: stringList(payload.productIds),
        },
    };
}
