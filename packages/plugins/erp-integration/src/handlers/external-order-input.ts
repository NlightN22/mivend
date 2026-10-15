import { Logger } from '@nestjs/common';
import type { ExternalOrderInput, ExternalOrderLineInput } from '@mivend/plugin-erp-order';

export interface ResolvedOrderLine {
    productVariantId: string;
    ratioToBase: number;
    raw: Record<string, unknown>;
}

const toMinor = (value: number): number => Math.round(value * 100);

function optionalNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

// OrderChanged.paid_amount is a real `optional double`: null means not computed, never zero.
// The column is int4 (a bigint would need a GraphQL scalar), so a value beyond it is ignored, not stored.
const INT4_MAX = 2_147_483_647;

export function paidAmountMinor(payload: Record<string, unknown>): number | null {
    if (payload.paidAmount === undefined || payload.paidAmount === null) return null;
    const paid = optionalNumber(payload.paidAmount);
    const minor = paid === null ? NaN : toMinor(paid);
    if (!Number.isSafeInteger(minor) || minor < 0 || minor > INT4_MAX) {
        Logger.warn(
            `Ignoring unusable paidAmount ${String(payload.paidAmount)}`,
            'ExternalOrderInput',
        );
        return null;
    }
    return minor;
}

// google.protobuf.Timestamp arrives as an RFC3339 string (see promo-rule.handler.ts).
function parseTimestamp(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

// Amount is the line total after discounts, so it wins over the list price per unit.
export function externalLine(line: ResolvedOrderLine): ExternalOrderLineInput {
    const quantity = Math.round(Number(line.raw.quantity ?? 0) * line.ratioToBase);
    const amount = optionalNumber(line.raw.amount);
    const price = optionalNumber(line.raw.price);
    const unitPriceMinor =
        amount !== null && quantity > 0
            ? Math.round(toMinor(amount) / quantity)
            : toMinor((price ?? 0) / line.ratioToBase);
    return { productVariantId: line.productVariantId, quantity, unitPriceMinor };
}

export function buildExternalOrderInput(
    entityId: string,
    payload: Record<string, unknown>,
    derivedStatus: string | null,
    lines: ResolvedOrderLine[],
    skippedLineCount = 0,
): ExternalOrderInput {
    const totalAmount = optionalNumber(payload.totalAmount);
    const vatTotal = optionalNumber(payload.vatTotal);
    return {
        erpOrderId: entityId,
        counterpartyErpId: optionalString(payload.customerId),
        erpStatus: derivedStatus,
        erpStatusAt: parseTimestamp(payload.updatedAt) ?? parseTimestamp(payload.occurredAt),
        erpOrderStatus: payload.status != null ? String(payload.status) : '',
        documentNumber: optionalString(payload.documentNumber),
        contractId: optionalString(payload.contractId),
        orderDate: parseTimestamp(payload.orderDate),
        totalWithTaxMinor: totalAmount === null ? null : toMinor(totalAmount),
        vatTotalMinor: vatTotal === null ? null : toMinor(vatTotal),
        amountIncludesVat: payload.amountIncludesVat !== false,
        paidAmountMinor: paidAmountMinor(payload),
        lines: lines.map(externalLine),
        skippedLineCount,
    };
}
