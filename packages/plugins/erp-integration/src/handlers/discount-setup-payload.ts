import type { DiscountRecipientInput, DiscountSetupInput } from '@mivend/plugin-price-entry';
import { NonRetryableInboundError } from '../non-retryable-inbound-error';
import { optionalNumber, optionalString, parseTimestamp } from './proto-json-fields';
import { parseSelectionFilter, parseSelectionMode, stringList } from './selection-payload';

export type ParsedDiscountSetup =
    | { kind: 'tombstone'; version: string }
    | { kind: 'unposted'; version: string }
    | { kind: 'upsert'; input: DiscountSetupInput };

// Field accounting (consumed vs deferred, event-contracts 0.82.0): docs/ai/erp-streams-map.md
// "Discount and retro-bonus setup documents".
export function parseDiscountSetup(
    entityId: string,
    payload: Record<string, unknown>,
): ParsedDiscountSetup {
    const version = String(payload.version ?? '');
    if (payload.isDeleted === true) return { kind: 'tombstone', version };
    if (payload.isActive !== true) return { kind: 'unposted', version };

    const validFrom = parseTimestamp(payload.effectiveFrom);
    const validTo = optionalString(payload.effectiveTo)
        ? parseTimestamp(payload.effectiveTo)
        : null;
    const productMode = parseSelectionMode(payload.productMode);
    const invalid =
        (!entityId && 'entityId') ||
        (!version && 'version') ||
        (!validFrom && 'effectiveFrom') ||
        (optionalString(payload.effectiveTo) && !validTo && 'effectiveTo') ||
        (!productMode && 'productMode');
    if (invalid || !validFrom || !productMode) {
        throw new NonRetryableInboundError(
            `discount-setup ${entityId}: invalid or missing ${String(invalid)}`,
        );
    }
    const allProducts = payload.allProducts === true;
    const percent = optionalNumber(payload.percent) ?? 0;
    const inactiveReason = notApplicableReason(payload, percent, allProducts, productMode);
    return {
        kind: 'upsert',
        input: {
            setup: {
                erpId: entityId,
                documentNumber: String(payload.documentNumber ?? ''),
                percent,
                conditionName: String(payload.condition ?? ''),
                conditionNumber: optionalNumber(payload.conditionNumber),
                priceTypeErpId: optionalString(payload.priceTypeId),
                limitPercent: optionalNumber(payload.limitPercent),
                validFrom,
                validTo,
                active: inactiveReason === null,
                inactiveReason,
                allProducts,
                productMode,
                productFilter: parseSelectionFilter(payload.productFilter),
                sourceVersion: version,
            },
            recipients: parseRecipients(payload.recipients),
            productErpIds: productIds(payload),
        },
    };
}

// Fail closed: anything mivend cannot evaluate faithfully is stored inactive with the reason, never applied.
function notApplicableReason(
    payload: Record<string, unknown>,
    percent: number,
    allProducts: boolean,
    productMode: 'list' | 'filter',
): string | null {
    if (!Number.isFinite(percent) || percent === 0) return 'no-header-percent';
    if (optionalNumber(payload.priceNumber) !== null) return 'fixed-price';
    if (optionalString(payload.conditionRefId) !== null) return 'reference-condition';
    if (payload.byWeekdays === true) return 'weekday-windows';
    if (productMode === 'filter' && !allProducts) return 'product-filter';
    return null;
}

function parseRecipients(value: unknown): DiscountRecipientInput[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const rows: DiscountRecipientInput[] = [];
    for (const raw of value) {
        const row = (raw ?? {}) as Record<string, unknown>;
        if (optionalString(row.warehouseId) !== null) continue;
        const recipient = {
            counterpartyErpId: optionalString(row.counterpartyId) ?? '',
            contractErpId: optionalString(row.contractId) ?? '',
        };
        const key = `${recipient.counterpartyErpId}\u0002${recipient.contractErpId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(recipient);
    }
    return rows;
}

function productIds(payload: Record<string, unknown>): string[] {
    const lines = Array.isArray(payload.productLines) ? payload.productLines : [];
    const fromLines = lines.map(line => String((line as Record<string, unknown>).productId ?? ''));
    return [...new Set([...stringList(payload.productIds), ...fromLines].filter(Boolean))];
}
