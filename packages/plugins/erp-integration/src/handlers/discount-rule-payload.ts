import type {
    CounterpartyDiscountRuleInput,
    DiscountRuleCondition,
    DiscountRuleRecipientType,
} from '@mivend/plugin-price-entry';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { optionalNumber, optionalString, parseTimestamp, zeroNumber } from './proto-json-fields';

// Closed sets: any other value is a contract break, not reference data.
const VALID_RECIPIENT_TYPES: readonly DiscountRuleRecipientType[] = ['counterparty', 'contract'];
const VALID_CONDITIONS: readonly DiscountRuleCondition[] = ['byQuantity', 'byDocumentAmount'];

export type ParsedDiscountRule =
    | { kind: 'tombstone'; version: string }
    | { kind: 'inactive' }
    | { kind: 'upsert'; input: CounterpartyDiscountRuleInput };

export function parseDiscountRule(
    entityId: string,
    payload: Record<string, unknown>,
): ParsedDiscountRule {
    if (payload.isDeleted === true) {
        return { kind: 'tombstone', version: String(payload.version ?? '') };
    }
    if (payload.isActive !== true) return { kind: 'inactive' };

    const recipientType = String(payload.recipientType ?? '') as DiscountRuleRecipientType;
    const condition = String(payload.condition ?? '') as DiscountRuleCondition;
    const recipientErpId = String(payload.recipientId ?? '');
    const conditionValue = zeroNumber(payload.conditionValue);
    const percent = zeroNumber(payload.percent);
    const version = String(payload.version ?? '');
    const effectiveFrom = parseTimestamp(payload.effectiveFrom);
    const effectiveTo = optionalString(payload.effectiveTo)
        ? parseTimestamp(payload.effectiveTo)
        : null;
    const invalid =
        (!VALID_RECIPIENT_TYPES.includes(recipientType) && 'recipientType') ||
        (!VALID_CONDITIONS.includes(condition) && 'condition') ||
        (!recipientErpId && 'recipientId') ||
        (!version && 'version') ||
        (!Number.isFinite(conditionValue) && 'conditionValue') ||
        (!Number.isFinite(percent) && 'percent') ||
        (!effectiveFrom && 'effectiveFrom') ||
        (optionalString(payload.effectiveTo) && !effectiveTo && 'effectiveTo');
    if (invalid || !effectiveFrom) {
        throw new NonRetryableInboundError(
            `discount-rule ${entityId}: invalid or missing ${String(invalid)}`,
        );
    }
    return {
        kind: 'upsert',
        input: {
            erpId: entityId,
            recipientType,
            recipientErpId,
            productErpId: optionalString(payload.productId),
            condition,
            conditionValue,
            percent,
            limitAmount: optionalNumber(payload.limitAmount),
            validFrom: effectiveFrom,
            validTo: effectiveTo,
            sourceVersion: version,
        },
    };
}
