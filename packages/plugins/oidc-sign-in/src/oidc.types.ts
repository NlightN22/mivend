export const loggerCtx = 'OidcSignIn';
export const OIDC_PLUGIN_OPTIONS = Symbol('OIDC_PLUGIN_OPTIONS');
export const OIDC_STRATEGY_NAME = 'oidc';

export const REQUEST_TTL_DEFAULT_MS = 10 * 60_000;
export const VERIFIED_TTL_DEFAULT_MS = 2 * 60_000;
export const CLEANUP_POLL_INTERVAL_DEFAULT = 60 * 60_000;
export const MAX_PENDING_DEFAULT = 500;
export const HTTP_TIMEOUT_MS = 10_000;

export interface OidcPluginOptions {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    requestTtlMs?: number;
    verifiedTtlMs?: number;
    maxPendingRequests?: number;
    cleanupPollIntervalMs?: number;
}

export interface OidcClaims {
    sub: string;
    email: string | null;
}

export type RequestStatus = 'PENDING' | 'EXCHANGING' | 'VERIFIED' | 'USED';

export interface ExchangeRow {
    id: number;
    nonce: string;
    codeVerifier: string;
}
