export const loggerCtx = 'ReservationPlugin';

export const RESERVATION_PLUGIN_OPTIONS = Symbol('RESERVATION_PLUGIN_OPTIONS');

export const DEFAULT_RESERVATION_DAYS = 3;
export const EXPIRY_POLL_INTERVAL_DEFAULT = 60_000;

export interface ReservationPluginOptions {
    redis: {
        host: string;
        port: number;
        password?: string;
    };
    // Staff-facing default shown when confirming an order — see Order.customFields.reservationDays.
    defaultReservationDays?: number;
    expiryPollIntervalMs?: number;
}
