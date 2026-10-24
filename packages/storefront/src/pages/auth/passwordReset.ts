export const MIN_PASSWORD_LENGTH = 8;

const DEAD_LINK_CODES = new Set([
    'PASSWORD_RESET_TOKEN_INVALID_ERROR',
    'PASSWORD_RESET_TOKEN_EXPIRED_ERROR',
]);

export function isDeadLinkCode(errorCode: string): boolean {
    return DEAD_LINK_CODES.has(errorCode);
}

export function isTooShort(password: string): boolean {
    return password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
}

export function isMismatch(password: string, confirm: string): boolean {
    return confirm.length > 0 && password !== confirm;
}

export function canSubmit(password: string, confirm: string): boolean {
    return password.length >= MIN_PASSWORD_LENGTH && password === confirm;
}
