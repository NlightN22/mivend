declare module '@vendure/core' {
    interface CustomOrderFields {
        actingSessionId?: string | null;
        actingAdministratorId?: string | null;
    }
}

export const loggerCtx = 'ActingSessionPlugin';

export const ACTING_SESSION_PLUGIN_OPTIONS = Symbol('ACTING_SESSION_PLUGIN_OPTIONS');

// Sent by the storefront on every acting-tab request; only makes the server ignore the browser's cookie.
export const ACTING_HEADER = 'x-acting-session';

export const ACTING_AUTH_STRATEGY = 'acting-ticket';

export const TICKET_TTL_DEFAULT_MS = 60_000;
export const SESSION_TTL_DEFAULT_MS = 4 * 60 * 60_000;
export const MAX_PER_MANAGER_DEFAULT = 10;
export const MAX_PER_CUSTOMER_DEFAULT = 3;
export const CART_TTL_DEFAULT_MS = 24 * 60 * 60_000;
export const CLEANUP_POLL_INTERVAL_DEFAULT = 15 * 60_000;

export interface ActingSessionPluginOptions {
    storefrontPublicUrl: string;
    ticketTtlMs?: number;
    sessionTtlMs?: number;
    cartTtlMs?: number;
    maxPerManager?: number;
    maxPerCustomer?: number;
    cleanupPollIntervalMs?: number;
}

export interface ActingTicketStart {
    ticket: string;
    storefrontUrl: string;
    expiresAt: Date;
}

export interface ActingSessionToken {
    token: string;
    expiresAt: Date;
    administratorId: string;
    administratorName: string;
    counterpartyId: string;
    tradingPointId: string | null;
}
