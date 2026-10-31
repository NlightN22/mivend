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
    const recipients = parseRecipients(payload.recipients);
    const inactiveReason =
        notApplicableReason(payload, percent) ?? (recipients.length === 0 ? 'no-recipients' : null);
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
            recipients,
            operationKind: String(payload.operationKind ?? ''),
            productErpIds: productIds(payload),
            productPercents: linePercents(payload),
        },
    };
}

// Fail closed: any attribute mivend does not evaluate, set to a non-default value, stores the document inactive.
// Quality, purpose and currency are deliberately ignored: they never restrict a discount here.
// Values are opaque ERP ids and enums: only empty/absent versus set is compared, never a name.
function notApplicableReason(payload: Record<string, unknown>, percent: number): string | null {
    if (!Number.isFinite(percent) || percent === 0) return 'no-header-percent';
    if (optionalNumber(payload.priceNumber) !== null) return 'fixed-price';
    if (optionalString(payload.conditionRefId) !== null) return 'reference-condition';
    if (payload.byWeekdays === true || nonEmpty(payload.weekdayWindows)) return 'weekday-windows';
    const unevaluated = UNEVALUATED_ATTRIBUTES.find(([key]) => isSet(payload[key]));
    if (unevaluated) return unevaluated[1];
    if (payload.pseudo === true) return 'pseudo-document';
    if (nonEmpty(payload.productLines) && hasLineAttributes(payload.productLines)) {
        return 'product-line-attributes';
    }
    return null;
}

const UNEVALUATED_ATTRIBUTES: ReadonlyArray<readonly [string, string]> = [
    ['markupTypeId', 'markup-type'],
    ['commonTimeFrom', 'time-window'],
    ['commonTimeTo', 'time-window'],
    ['priceGroups', 'price-groups'],
    ['bonusLines', 'bonus-lines'],
    ['setComponents', 'set-components'],
];

const isSet = (value: unknown): boolean =>
    Array.isArray(value) ? value.length > 0 : optionalString(value) !== null;

function nonEmpty(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0;
}

function hasLineAttributes(lines: unknown): boolean {
    return (lines as Array<Record<string, unknown>>).some(
        line =>
            ['characteristicId', 'priceTypeId'].some(key => optionalString(line?.[key]) !== null) ||
            !!optionalNumber(line?.priceNumber),
    );
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

// A line percent differing from the header replaces it for that product; zero means "use the header".
function linePercents(
    payload: Record<string, unknown>,
): Array<{ productErpId: string; percent: number }> {
    const lines = Array.isArray(payload.productLines) ? payload.productLines : [];
    const byProduct = new Map<string, number>();
    for (const raw of lines) {
        const line = raw as Record<string, unknown>;
        const percent = optionalNumber(line.percent);
        if (percent) byProduct.set(String(line.productId ?? ''), percent);
    }
    byProduct.delete('');
    return [...byProduct].map(([productErpId, percent]) => ({ productErpId, percent }));
}

function productIds(payload: Record<string, unknown>): string[] {
    const lines = Array.isArray(payload.productLines) ? payload.productLines : [];
    const fromLines = lines.map(line => String((line as Record<string, unknown>).productId ?? ''));
    return [...new Set([...stringList(payload.productIds), ...fromLines].filter(Boolean))];
}
