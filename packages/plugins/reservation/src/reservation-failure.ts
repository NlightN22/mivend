import {
    ErpExportDataMissingError,
    InsufficientStockError,
    InvalidMultiplicityError,
    OrderNotEligibleError,
} from './reservation-errors';
import type { ReservationFailureReason } from './types';

export interface ReservationFailure {
    reason: ReservationFailureReason;
    detail: string;
}

const MAX_DETAIL_LENGTH = 500;

// Expected, staff-actionable outcomes of reserveOrder(); anything else is UNEXPECTED and rethrown.
export function isExpectedReservationError(error: unknown): boolean {
    return (
        error instanceof InsufficientStockError ||
        error instanceof OrderNotEligibleError ||
        error instanceof ErpExportDataMissingError ||
        error instanceof InvalidMultiplicityError
    );
}

export function variantIdsOf(error: unknown): string[] {
    if (error instanceof InsufficientStockError || error instanceof InvalidMultiplicityError) {
        return error.lines.map(l => l.productVariantId);
    }
    if (error instanceof ErpExportDataMissingError) {
        return error.lines.map(l => l.productVariantId);
    }
    return [];
}

export function describeReservationFailure(
    error: unknown,
    skuByVariantId: Map<string, string>,
): ReservationFailure {
    const sku = (id: string): string => `SKU ${skuByVariantId.get(id) ?? id}`;
    let failure: ReservationFailure;
    if (error instanceof InsufficientStockError) {
        failure = {
            reason: 'INSUFFICIENT_STOCK',
            detail: error.lines
                .map(
                    l => `${sku(l.productVariantId)}: need ${l.required}, available ${l.available}`,
                )
                .join('; '),
        };
    } else if (error instanceof ErpExportDataMissingError) {
        const parts: string[] = [];
        if (error.missingCustomerId) parts.push('customer has no ERP counterparty');
        if (error.missingContract) parts.push('no active contract');
        for (const line of error.lines) {
            parts.push(`${sku(line.productVariantId)}: missing ${line.missing.join(', ')}`);
        }
        failure = { reason: 'ERP_EXPORT_DATA_MISSING', detail: parts.join('; ') };
    } else if (error instanceof InvalidMultiplicityError) {
        failure = {
            reason: 'NOT_ELIGIBLE',
            detail: error.lines
                .map(
                    l =>
                        `${sku(l.productVariantId)}: quantity ${l.quantity}, pack ${l.multiplicity}`,
                )
                .join('; '),
        };
    } else if (error instanceof OrderNotEligibleError) {
        failure = { reason: 'NOT_ELIGIBLE', detail: error.message };
    } else {
        failure = {
            reason: 'UNEXPECTED',
            detail: error instanceof Error ? error.message : String(error),
        };
    }
    return { ...failure, detail: failure.detail.slice(0, MAX_DETAIL_LENGTH) };
}
