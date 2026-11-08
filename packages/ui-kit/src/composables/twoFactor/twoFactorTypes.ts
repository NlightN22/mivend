export type TwoFactorFailure =
    | 'INVALID_CREDENTIALS'
    | 'CHALLENGE_INVALID'
    | 'INVALID_CODE'
    | 'PASSWORD_INVALID'
    | 'CODE_REQUIRED'
    | 'NOT_ENROLLED'
    | 'ENROLMENT_EXPIRED'
    | 'RECOVERY_LINK_INVALID';

export type TwoFactorUiError = TwoFactorFailure | 'UNKNOWN';

export interface TwoFactorEnrolment {
    otpauthUri: string;
    secret: string;
    expiresAt: string;
}

export interface TwoFactorStatusView {
    required: boolean;
    enrolled: boolean;
    activatedAt: string | null;
    pendingEnrolment: boolean;
}

export type Failed = { kind: 'failure'; failure: TwoFactorFailure };
export type StartResult =
    | { kind: 'challenge'; stage: 'VERIFY' | 'ENROL'; challenge: string }
    | { kind: 'none' }
    | Failed;
export type RecoveryRequestResult = { kind: 'sent'; maskedEmailAddress: string } | Failed;
export type CodeResult = { kind: 'ok' } | Failed;
export type EnrolmentResult = { kind: 'enrolment'; enrolment: TwoFactorEnrolment } | Failed;
export type ConfirmResult = { kind: 'status'; status: TwoFactorStatusView } | Failed;

export interface TwoFactorSignInApi {
    start(username: string, password: string): Promise<StartResult>;
    plainLogin(username: string, password: string, rememberMe: boolean): Promise<boolean>;
    authenticate(challenge: string, code: string, rememberMe: boolean): Promise<CodeResult>;
    startEnrolment(challenge: string): Promise<EnrolmentResult>;
    requestRecovery(challenge: string): Promise<RecoveryRequestResult>;
}

export interface TwoFactorSettingsApi {
    status(): Promise<TwoFactorStatusView>;
    startEnrolment(password: string, currentCode: string | null): Promise<EnrolmentResult>;
    confirm(code: string): Promise<ConfirmResult>;
}

export interface TwoFactorRecoveryApi {
    complete(token: string, password: string): Promise<'ok' | TwoFactorFailure>;
}

const AUTH_ERRORS: Record<string, TwoFactorFailure> = {
    TWO_FACTOR_CHALLENGE_INVALID: 'CHALLENGE_INVALID',
    TWO_FACTOR_INVALID_CODE: 'INVALID_CODE',
    TWO_FACTOR_ENROLMENT_EXPIRED: 'ENROLMENT_EXPIRED',
};

export function authenticationErrorToFailure(authenticationError: string): TwoFactorFailure {
    return AUTH_ERRORS[authenticationError] ?? 'INVALID_CREDENTIALS';
}

export const CODE_LENGTH = 6;

export function normalizeCode(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export function isCompleteCode(raw: string): boolean {
    return normalizeCode(raw).length === CODE_LENGTH;
}
