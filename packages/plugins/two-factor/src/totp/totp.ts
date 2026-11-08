import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { base32Decode, base32Encode } from './base32';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
const SECRET_BYTES = 20;

export function generateSecret(): string {
    return base32Encode(randomBytes(SECRET_BYTES));
}

// RFC 4226 section 5.3 with HMAC-SHA-1.
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const hash = createHmac('sha1', secret).update(message).digest();
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
        ((hash[offset] & 0x7f) << 24) |
        (hash[offset + 1] << 16) |
        (hash[offset + 2] << 8) |
        hash[offset + 3];
    return String(binary % 10 ** digits).padStart(digits, '0');
}

export function timeStep(nowMs: number): number {
    return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function normaliseCode(input: string): string | null {
    const code = input.replace(/\s/g, '');
    return /^\d{6}$/.test(code) ? code : null;
}

// Returns the accepted time step (current +-1) or null; a step at or below lastUsedStep is a replay.
// Every candidate is compared without early exit.
export function verifyTotp(
    base32Secret: string,
    input: string,
    nowMs: number,
    lastUsedStep: number | null,
): number | null {
    const code = normaliseCode(input);
    if (!code) return null;
    const secret = base32Decode(base32Secret);
    const given = Buffer.from(code);
    const current = timeStep(nowMs);
    let accepted: number | null = null;
    for (const step of [current - 1, current, current + 1]) {
        const expected = Buffer.from(hotp(secret, step));
        const matches = timingSafeEqual(expected, given);
        if (matches && (lastUsedStep === null || step > lastUsedStep)) {
            accepted = accepted === null || step > accepted ? step : accepted;
        }
    }
    return accepted;
}

export function otpauthUri(secret: string, account: string, issuer: string): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
    const query = new URLSearchParams({
        secret,
        issuer,
        algorithm: 'SHA1',
        digits: String(TOTP_DIGITS),
        period: String(TOTP_PERIOD_SECONDS),
    });
    return `otpauth://totp/${label}?${query.toString()}`;
}
