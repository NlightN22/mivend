export const loggerCtx = 'TwoFactorPlugin';

export const TWO_FACTOR_PLUGIN_OPTIONS = Symbol('TWO_FACTOR_PLUGIN_OPTIONS');

export const TWO_FACTOR_STRATEGY_NAME = 'twoFactor';

export const CHALLENGE_TTL_DEFAULT_MS = 5 * 60_000;
export const PENDING_TTL_DEFAULT_MS = 10 * 60_000;
export const RECOVERY_TTL_DEFAULT_MS = 30 * 60_000;
export const RECOVERY_REQUEST_INTERVAL_DEFAULT_MS = 60_000;
export const MAX_TOKEN_ATTEMPTS_DEFAULT = 5;
export const CLEANUP_POLL_INTERVAL_DEFAULT = 60 * 60_000;

export interface TwoFactorPluginOptions {
    required: boolean;
    encryptionKey: Buffer;
    issuer: string;
    challengeTtlMs?: number;
    pendingTtlMs?: number;
    recoveryTtlMs?: number;
    recoveryRequestIntervalMs?: number;
    maxTokenAttempts?: number;
    cleanupPollIntervalMs?: number;
}

export type TwoFactorApi = 'shop' | 'admin';
export type TwoFactorStage = 'NONE' | 'VERIFY' | 'ENROL';
export type TokenPurpose = 'sign-in' | 'recovery';
export type FactorStatus = 'pending' | 'active';

export type TwoFactorFailure =
    | 'INVALID_CREDENTIALS'
    | 'CHALLENGE_INVALID'
    | 'INVALID_CODE'
    | 'PASSWORD_INVALID'
    | 'CODE_REQUIRED'
    | 'NOT_ENROLLED'
    | 'ENROLMENT_EXPIRED'
    | 'RECOVERY_LINK_INVALID';

export interface TwoFactorRecoveryRequestedResult {
    __typename: 'TwoFactorRecoveryRequested';
    success: true;
    maskedEmailAddress: string;
}

export interface TwoFactorErrorResult {
    __typename: 'TwoFactorError';
    errorCode: 'TWO_FACTOR_ERROR';
    message: string;
    failure: TwoFactorFailure;
}

export function twoFactorError(failure: TwoFactorFailure): TwoFactorErrorResult {
    return {
        __typename: 'TwoFactorError',
        errorCode: 'TWO_FACTOR_ERROR',
        message: failure,
        failure,
    };
}

export interface TwoFactorChallengeResult {
    __typename: 'TwoFactorChallenge';
    stage: TwoFactorStage;
    challenge: string | null;
    expiresAt: Date | null;
}

export interface TwoFactorEnrolmentResult {
    __typename: 'TwoFactorEnrolment';
    otpauthUri: string;
    secret: string;
    expiresAt: Date;
}

export interface TwoFactorStatusResult {
    __typename: 'TwoFactorStatus';
    required: boolean;
    enrolled: boolean;
    method: string | null;
    activatedAt: Date | null;
    pendingEnrolment: boolean;
}

export interface FactorRow {
    id: number;
    uuid: string;
    userId: string;
    method: string;
    status: FactorStatus;
    secretEncrypted: string;
    lastUsedStep: number | null;
    pendingExpiresAt: Date | null;
    activatedAt: Date | null;
    pendingLive: boolean;
}

export interface TokenRow {
    id: number;
    userId: string;
    purpose: TokenPurpose;
    stage: 'VERIFY' | 'ENROL' | null;
    apiType: TwoFactorApi | null;
    expiresAt: Date;
    usedAt: Date | null;
    attempts: number;
}
