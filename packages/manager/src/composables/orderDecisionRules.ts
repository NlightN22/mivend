import type { OrderCheckFinding } from '../utils/orderCheckMessages';

export const AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION';
export const FALLBACK_RESERVATION_DAYS = 3;

export interface OrderDecisionFacts {
    state: string;
    cancellable: boolean;
    reservationState: string | null;
}

export function mayConfirm(facts: OrderDecisionFacts, permitted: boolean): boolean {
    return (
        permitted && facts.state !== 'Cancelled' && facts.reservationState === AWAITING_CONFIRMATION
    );
}

// Cancellability is the server's own answer (Order.cancellable); the UI never re-derives it.
export function mayReject(facts: OrderDecisionFacts, permitted: boolean): boolean {
    return permitted && facts.cancellable;
}

export function parseReservationDays(input: string): number | null {
    const days = Number(input);
    return Number.isInteger(days) && days > 0 ? days : null;
}

export function openFindings(findings: OrderCheckFinding[]): OrderCheckFinding[] {
    return findings.filter(f => !f.stale && f.severity !== 'info');
}
