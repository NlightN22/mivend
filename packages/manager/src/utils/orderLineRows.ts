import type { OrderDetailLine, PriceAdjustmentRequestSummary } from '../api/orderDetail';
import type { OrderLineAvailability } from '../api/orderLineEdit';
import type { OrderReservation } from '../api/reservation';
import { findingsByLine, type OrderCheckFinding } from './orderCheckMessages';
import {
    isBelowFloor,
    lineCheckView,
    lineReservedQuantity,
    type LineCheckView,
} from './orderLineChecks';

export interface AdjustmentInfo {
    label: string;
    variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
    approvalRequestId: string | null;
}

export interface OrderLineRow {
    line: OrderDetailLine;
    findings: OrderCheckFinding[];
    view: LineCheckView;
    reserved: number;
    reserveShort: boolean;
    belowFloor: boolean;
    discountPercent: number | null;
    // Seam for the discount-rights system: unset today, so a discount is never flagged.
    maxDiscountPercent?: number | null;
    discountOverLimit: boolean;
    adjustment: AdjustmentInfo | null;
}

export function discountPercent(listPrice: number, discountedPrice: number): number | null {
    if (listPrice <= 0 || discountedPrice >= listPrice) return null;
    return Math.round(((listPrice - discountedPrice) / listPrice) * 1000) / 10;
}

function adjustmentsByLine(
    lines: OrderDetailLine[],
    requests: PriceAdjustmentRequestSummary[],
): Map<string, AdjustmentInfo> {
    const map = new Map<string, AdjustmentInfo>();
    for (const request of requests) {
        let lineId: string | undefined;
        try {
            lineId = (JSON.parse(request.payload) as { orderLineId?: string }).orderLineId;
        } catch {
            continue;
        }
        if (!lineId) continue;
        if (request.status === 'pending') {
            map.set(lineId, {
                label: 'Pending approval',
                variant: 'warning',
                approvalRequestId: request.id,
            });
        } else if (request.status === 'approved' && !map.has(lineId)) {
            map.set(lineId, {
                label: 'Approved adjustment',
                variant: 'success',
                approvalRequestId: request.id,
            });
        }
    }
    for (const line of lines) {
        if (!map.has(line.id) && line.customFields.manualUnitPrice !== null) {
            map.set(line.id, {
                label: 'Self-service adjustment',
                variant: 'info',
                approvalRequestId: null,
            });
        }
    }
    return map;
}

export interface LineRowInputs {
    lines: OrderDetailLine[];
    findings: OrderCheckFinding[];
    availability: Map<string, OrderLineAvailability>;
    reservations: OrderReservation[];
    requests: PriceAdjustmentRequestSummary[];
    // The signed-in employee's own discount ceiling for the line; null when none is set.
    maxDiscountPercent?: (line: OrderDetailLine) => number | null;
}

export function buildLineRows(input: LineRowInputs): OrderLineRow[] {
    const byLine = findingsByLine(input.findings);
    const adjustments = adjustmentsByLine(input.lines, input.requests);
    const reservationActive = input.reservations.some(r => r.status === 'active');
    return input.lines.map(line => {
        const findings = byLine.get(line.id) ?? [];
        const view = lineCheckView(
            line.quantity,
            input.availability.get(line.id)?.available,
            findings,
        );
        const reserved = lineReservedQuantity(input.reservations, line.id);
        const percent = discountPercent(line.unitPriceWithTax, line.discountedUnitPriceWithTax);
        const max = input.maxDiscountPercent?.(line) ?? null;
        const part = {
            view,
            belowFloor: isBelowFloor(findings),
            reserveShort: reservationActive && reserved < view.needed,
            discountOverLimit: percent !== null && max !== null && percent > max,
        };
        return {
            line,
            findings,
            reserved,
            adjustment: adjustments.get(line.id) ?? null,
            discountPercent: percent,
            maxDiscountPercent: max,
            ...part,
        };
    });
}
