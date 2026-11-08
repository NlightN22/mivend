import { describe, expect, it } from 'vitest';

import { base32Decode, base32Encode } from '../../totp/base32';
import { hotp, normaliseCode, otpauthUri, timeStep, verifyTotp } from '../../totp/totp';

// RFC 6238 appendix B, SHA-1 vectors: secret "12345678901234567890", 8 digits.
const RFC_SECRET = Buffer.from('12345678901234567890');
const RFC_VECTORS: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
];
const SECRET = base32Encode(RFC_SECRET);
const AT = 1111111109_000;
const AT_CODE = '081804';

describe('hotp / RFC 6238', () => {
    it.each(RFC_VECTORS)('matches the RFC vector at T=%i', (seconds, expected) => {
        expect(hotp(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
    });

    it('yields six digits by default, keeping leading zeros', () => {
        expect(hotp(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804');
    });
});

describe('base32', () => {
    it('round-trips arbitrary bytes and tolerates spaces and case', () => {
        const bytes = Buffer.from('0123456789abcdef0123');
        const encoded = base32Encode(bytes);
        expect(encoded).toMatch(/^[A-Z2-7]{32}$/);
        expect(base32Decode(encoded.toLowerCase().replace(/(.{4})/g, '$1 '))).toEqual(bytes);
    });

    it('refuses a character outside the alphabet', () => {
        expect(() => base32Decode('ABC1')).toThrow();
    });
});

describe('verifyTotp', () => {
    it('accepts the current step and returns it', () => {
        expect(verifyTotp(SECRET, AT_CODE, AT, null)).toBe(timeStep(AT));
    });

    it('accepts one step either side and nothing further', () => {
        const code = hotp(RFC_SECRET, timeStep(AT));
        expect(verifyTotp(SECRET, code, AT + 30_000, null)).toBe(timeStep(AT));
        expect(verifyTotp(SECRET, code, AT - 30_000, null)).toBe(timeStep(AT));
        expect(verifyTotp(SECRET, code, AT + 60_000, null)).toBeNull();
        expect(verifyTotp(SECRET, code, AT - 60_000, null)).toBeNull();
    });

    it('rejects a step already used and any earlier one (replay)', () => {
        const step = timeStep(AT);
        expect(verifyTotp(SECRET, AT_CODE, AT, step)).toBeNull();
        expect(verifyTotp(SECRET, AT_CODE, AT, step + 1)).toBeNull();
        const next = hotp(RFC_SECRET, step + 1);
        expect(verifyTotp(SECRET, next, AT, step)).toBe(step + 1);
    });

    it('rejects a wrong code, a short code and non-digits', () => {
        expect(verifyTotp(SECRET, '000000', AT, null)).toBeNull();
        expect(verifyTotp(SECRET, '28708', AT, null)).toBeNull();
        expect(verifyTotp(SECRET, '2870821', AT, null)).toBeNull();
        expect(verifyTotp(SECRET, 'abcdef', AT, null)).toBeNull();
    });

    it('ignores the spaces an authenticator app shows inside the code', () => {
        expect(normaliseCode('081 804')).toBe(AT_CODE);
        expect(verifyTotp(SECRET, '081 804', AT, null)).toBe(timeStep(AT));
    });
});

describe('otpauthUri', () => {
    it('carries the issuer, account, secret and fixed parameters', () => {
        const uri = new URL(otpauthUri('ABCDEF', 'user@example.org', 'Site A'));
        expect(uri.protocol).toBe('otpauth:');
        expect(uri.host).toBe('totp');
        expect(decodeURIComponent(uri.pathname)).toBe('/Site A:user@example.org');
        expect(Object.fromEntries(uri.searchParams)).toEqual({
            secret: 'ABCDEF',
            issuer: 'Site A',
            algorithm: 'SHA1',
            digits: '6',
            period: '30',
        });
    });
});
