import { DEFAULT_RESERVATION_DAYS } from './types';

let configured: number | undefined;

export function setDefaultReservationDays(days: number | undefined): void {
    configured = days;
}

export function defaultReservationDays(): number {
    return configured ?? DEFAULT_RESERVATION_DAYS;
}
